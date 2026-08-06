"""Prompt builders and completion handlers for the prompt-workbench engine jobs.

All four kinds are prompt-only: no `cwd`, no repository clone (`news.poll` established the shape).

**Why suggestions return a whole rewritten body rather than a patch set.** An itemised patch list
whose `old` strings must match the original verbatim is fragile -- the model paraphrases, the
substring misses, and the merge silently drops a change. So the model returns the full rewritten
prompt plus *explanatory* change notes, and the UI derives accept/reject units from a deterministic
word-level diff of the two texts. Every unit is then applicable by construction, and the model's
rationale rides alongside instead of being load-bearing.

**Why every prompt here ends with "Do not use any tools".** These jobs need no filesystem: the whole
input is in the prompt. Left unsaid, the model reaches for `Bash` to poke around, the CLI denies it
(it is outside the engine's read-only allowlist and `--print` mode cannot ask), and the run wedges
until the timeout -- observed, not theorised. The instruction is the same control
`hobits.jobs.handle_feedback_distill` uses, and the short timeout below bounds the damage if a model
ignores it. Note an *empty* `allowed_tools` list would be actively worse than the default: with no
`--allowedTools` flag the CLI permits everything, so "[]" reads as unrestricted, not sandboxed.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import UTC, datetime

from sqlalchemy import select, update

from shire.core.db import unit_of_work
from shire.domain.hobits.repo_hobit import extract_json_block
from shire.domain.jobs.models import JobRow
from shire.domain.prompts.analysis import SIZE_VERDICTS, analyse
from shire.domain.prompts.domain import Archetype, OutputFormat, Tuning
from shire.domain.prompts.models import (
    PromptJudgementRow,
    PromptReviewRow,
    PromptRunRow,
    PromptSuggestionRow,
    PromptVersionRow,
)

logger = logging.getLogger(__name__)

# Bounds so a pathological prompt cannot blow the engine's context budget.
_BODY_CHAR_BUDGET = 60_000
_MAX_CHANGES = 25

# Tighter than the engine's 1000s default so a run that goes wrong does not hold a worker slot for
# 16 minutes -- but not the 120s the hobit distiller uses, because these jobs can legitimately be
# slow: rewriting a 60K-character prompt means generating ~15K output tokens, and a real one
# measured 326s. A tight bound here would fail honest work, which is worse than a slow queue.
PROMPT_ONLY_TIMEOUT_SECONDS = 600.0

# Appended to every prompt in this module -- see the module docstring.
_NO_TOOLS = "Do not use any tools -- everything you need is in this message."

#: Tools denied by name for arena runs. The prompt under test executes *verbatim* -- adding "do not
#: use tools" to it would mean measuring a different prompt than the one the user wrote -- so
#: isolation has to come from the engine. Deny beats allow, and an empty `allowed_tools` reads as
#: unrestricted rather than sandboxed, so an explicit deny list is the only way to express this.
#: Without it a run reaches into the engine container: an observed opus run executed `ls -la /app`,
#: which is both a leak and a source of irreproducible results.
#:
#: The CLI has no "deny everything" switch, so this is an enumeration and therefore best-effort: a
#: tool added by a future CLI release would not be covered. It intentionally lists everything that
#: can observe or change state; a meta-tool like `ToolSearch` is included for tidiness rather than
#: because it leaks anything, since it can only look for tools that remain denied.
NO_TOOLS_DENY_LIST = (
    "Bash",
    "BashOutput",
    "Edit",
    "ExitPlanMode",
    "Glob",
    "Grep",
    "KillShell",
    "NotebookEdit",
    "Read",
    "Task",
    "TodoWrite",
    "ToolSearch",
    "WebFetch",
    "WebSearch",
    "Write",
)

# How each archetype should read, in the model's terms. Keyed by the enum so a new archetype
# cannot be added without deciding what it means here.
_ARCHETYPE_GUIDANCE: dict[Archetype, str] = {
    Archetype.clear_crisp: "clear and crisp: short sentences, concrete nouns, no filler",
    Archetype.straight_to_point: (
        "straight to the point: lead with the ask, drop preamble and scene-setting"
    ),
    Archetype.politically_correct: (
        "carefully neutral: inclusive wording, no loaded terms, safe for a wide audience"
    ),
    Archetype.aggressive: (
        "forceful and demanding: unambiguous obligations, no hedging, no softeners. Keep it "
        "professional -- forceful is not rude, and shouting in capitals is counterproductive"
    ),
    Archetype.well_organized: (
        "well organised: explicit sections with headings, one idea per block, scannable"
    ),
    Archetype.action_oriented: (
        "action oriented: imperative verbs, each instruction something the reader can act on"
    ),
}

_OUTPUT_FORMAT_GUIDANCE: dict[OutputFormat, str] = {
    OutputFormat.none: "",
    OutputFormat.markdown: "The prompt must ask for Markdown output.",
    OutputFormat.json: (
        "The prompt must ask for a single JSON object and show its exact shape as an example."
    ),
    OutputFormat.plain: "The prompt must ask for plain prose with no markup.",
    OutputFormat.table: "The prompt must ask for a table and name its columns.",
}

_SUGGEST_PROMPT = """\
You are an expert prompt engineer. Improve the prompt below for a current Claude model. \
{no_tools}

## The prompt as it stands

<prompt>
{body}
</prompt>

## What a deterministic checker already found

{findings}

Treat these as verified: they were produced by static analysis of the text, not by a model. Fix \
them unless fixing one would break something the author clearly wants.

## How the author wants it changed

{guidance}

## Constraints to apply

{tuning}

## What good looks like

Keep everything only the author could know -- the audience, the product, the quality bar, and the \
*reasons* behind constraints. Those are context, not clutter, and deleting them is the most common \
way a rewrite makes a prompt worse. Length is not a defect; vagueness is.

Prefer stating the outcome and how to verify it over scripting the method. Say things once. Use \
normal emphasis: current models follow instructions closely, so shouting over-applies.

## Output

Return ONLY a single fenced json object as the very last thing in your response, nothing after \
it. `rewritten_body` must be a JSON string with the complete new prompt (escape quotes and \
newlines; do not put ``` fences inside it). List at most {max_changes} changes, most significant \
first; each `rationale` is one sentence on why the change helps.

```json
{{
  "summary": "2-3 sentences: what you changed and why, overall",
  "rewritten_body": "<the complete improved prompt>",
  "changes": [
    {{
      "title": "short label for the change",
      "rationale": "one sentence on why it helps",
      "dimension": "clarity | structure | emphasis | substance | safety | format"
    }}
  ]
}}
```"""

_CHANGE_DIMENSIONS = frozenset(
    {"clarity", "structure", "emphasis", "substance", "safety", "format"}
)


def _findings_section(body: str) -> str:
    """The free rule pack's verdict, handed to the model as established fact.

    This is the point of running the deterministic pass first: the rewrite starts from a list of
    real, named defects instead of spending its reasoning rediscovering them.
    """
    verdict = analyse(body)
    if not verdict.findings:
        return "Nothing. The static checks are clean, so look for what they cannot see."
    lines = [
        f"- [{finding.severity}] {finding.title}: {finding.detail} ({finding.why_it_matters})"
        for finding in verdict.findings
    ]
    return "\n".join(lines)


def _tuning_section(tuning: Tuning) -> str:
    """Turn the knob positions into instructions. Only non-default knobs produce a line, so the
    model is not handed a wall of "3 out of 5, do nothing in particular"."""
    lines = [f"- Voice: {_ARCHETYPE_GUIDANCE[tuning.archetype]}."]

    if tuning.criticality >= 4:
        lines.append(
            f"- Criticality {tuning.criticality}/5: mistakes here are expensive. Be explicit "
            "about what must not be guessed, and ask for the work to be checked before it is "
            "reported as done."
        )
    elif tuning.criticality <= 2:
        lines.append(
            f"- Criticality {tuning.criticality}/5: this is low-stakes. Do not add ceremony, "
            "verification steps, or caveats it does not need."
        )

    if tuning.sensitivity >= 4:
        lines.append(
            f"- Sensitivity {tuning.sensitivity}/5: the topic is delicate. Require careful, "
            "neutral wording and tell the reader to flag uncertainty rather than assert."
        )

    if tuning.verbosity >= 4:
        lines.append(
            f"- Verbosity {tuning.verbosity}/5: ask for a thorough answer with reasoning shown."
        )
    elif tuning.verbosity <= 2:
        lines.append(
            f"- Verbosity {tuning.verbosity}/5: ask for a short answer. Describe the shape you "
            "want rather than imposing a word count."
        )

    if tuning.audience:
        lines.append(f"- Audience: {tuning.audience}. Make the prompt name it.")

    format_line = _OUTPUT_FORMAT_GUIDANCE[tuning.output_format]
    if format_line:
        lines.append(f"- {format_line}")

    if tuning.keywords:
        lines.append(
            "- These terms must appear in the rewritten prompt: "
            + ", ".join(f"`{keyword}`" for keyword in tuning.keywords)
            + "."
        )

    if tuning.disclaimer:
        text = tuning.disclaimer_text or (
            "state that the output is advisory and should be checked by a human before it is "
            "acted on"
        )
        lines.append(f"- Include a disclaimer: {text}.")

    return "\n".join(lines)


def build_suggest_prompt(version: PromptVersionRow) -> str:
    body = version.body[:_BODY_CHAR_BUDGET]
    tuning = Tuning.model_validate(version.tuning or {})
    guidance = (version.guidance or "").strip()
    return _SUGGEST_PROMPT.format(
        no_tools=_NO_TOOLS,
        body=body,
        findings=_findings_section(body),
        guidance=guidance or "Nothing specific -- use your judgement.",
        tuning=_tuning_section(tuning),
        max_changes=_MAX_CHANGES,
    )


def _clean(value: object, limit: int) -> str:
    return "" if value is None else str(value).strip()[:limit]


def parse_suggestion(text: str) -> dict | None:
    """Pull `{summary, rewritten_body, changes}` out of the agent's reply, or None if unusable.

    A missing or empty `rewritten_body` is the one hard failure: change notes without a new prompt
    give the user nothing to preview.
    """
    block = extract_json_block(text)
    if block is None:
        return None
    try:
        data = json.loads(block)
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(data, dict):
        return None

    rewritten = _clean(data.get("rewritten_body"), _BODY_CHAR_BUDGET)
    if not rewritten:
        return None

    changes: list[dict] = []
    for raw in data.get("changes") or []:
        if not isinstance(raw, dict):
            continue
        title = _clean(raw.get("title"), 200)
        if not title:
            continue
        dimension = _clean(raw.get("dimension"), 40).lower()
        changes.append(
            {
                "title": title,
                "rationale": _clean(raw.get("rationale"), 1_000),
                # An out-of-vocabulary dimension falls back rather than poisoning the UI's chips.
                "dimension": dimension if dimension in _CHANGE_DIMENSIONS else "clarity",
            }
        )

    return {
        "summary": _clean(data.get("summary"), 4_000),
        "rewritten_body": rewritten,
        "changes": changes[:_MAX_CHANGES],
    }


# --- review (AI metrics) ----------------------------------------------------------------------

#: The scored dimensions, in the order the UI shows them. `hallucination_risk` is the one where a
#: high number is bad; everything else is "higher is better".
REVIEW_DIMENSIONS = (
    "clarity",
    "specificity",
    "structure",
    "context_sufficiency",
    "factfulness",
    "accuracy",
    "goal_focus",
    "hallucination_risk",
)

_REVIEW_SEVERITIES = frozenset({"high", "medium", "low"})
_MAX_REVIEW_FINDINGS = 15

_REVIEW_PROMPT = """\
You are a prompt-engineering reviewer. Score the prompt below on how well it will work against a \
current Claude model, and say what would raise the weakest scores. {no_tools}

<prompt>
{body}
</prompt>

## What a deterministic checker already found

{findings}

Those are mechanical facts about the text. Do not repeat them -- your value is the judgement they \
cannot make.

## How to score

Every score is an integer 0-100. Be a calibrated critic, not a flatterer: 50 is "workable but \
unremarkable", 80+ means you would ship it, and below 30 means it needs rewriting rather than \
tweaking. Judge the prompt as written, for the job it is evidently trying to do.

- clarity: how unambiguous the instructions are.
- specificity: how precisely the task and its constraints are pinned down.
- structure: how well organised it is for a reader working through it.
- context_sufficiency: whether the model is given enough to do the job without guessing.
- factfulness: whether the claims it makes are checkable and stated as facts rather than assumed. \
If it asserts things the model cannot verify, this drops.
- accuracy: whether following it literally produces what the author evidently wants.
- goal_focus: whether it pursues one clear goal rather than several competing ones.
- hallucination_risk: how likely this prompt is to produce confident invention -- **higher is \
worse**. Prompts that demand specifics they do not supply score high here.

## Output

Return ONLY a single fenced json object as the very last thing, nothing after it. List at most \
{max_findings} findings, most valuable first; each names one concrete change.

```json
{{
  "summary": "3-4 sentences: how well this prompt works and what limits it",
  "scores": {{
    "clarity": 0, "specificity": 0, "structure": 0, "context_sufficiency": 0,
    "factfulness": 0, "accuracy": 0, "goal_focus": 0, "hallucination_risk": 0
  }},
  "size_verdict": "too_small | right | too_big",
  "goal_count": 0,
  "findings": [
    {{
      "dimension": "one of the score names above",
      "severity": "high | medium | low",
      "title": "short label",
      "detail": "what to change and why it would help",
      "evidence": "the phrase from the prompt this is about, or null"
    }}
  ]
}}
```
`size_verdict` is your judgement of whether the prompt is the right *length for its task* -- not a \
token count, which the checker already has. `goal_count` is how many distinct goals you can see."""


def build_review_prompt(version: PromptVersionRow) -> str:
    body = version.body[:_BODY_CHAR_BUDGET]
    return _REVIEW_PROMPT.format(
        no_tools=_NO_TOOLS,
        body=body,
        findings=_findings_section(body),
        max_findings=_MAX_REVIEW_FINDINGS,
    )


def _score(value: object) -> int | None:
    """Clamp a model-supplied score into 0-100, or None if it is not a number at all."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return max(0, min(100, int(value)))


def parse_review(text: str) -> dict | None:
    """Pull the scored review out of the agent's reply, or None if unusable.

    At least one recognised score is required: a review with a summary but no numbers cannot move a
    trend line, which is the only reason this job exists.
    """
    block = extract_json_block(text)
    if block is None:
        return None
    try:
        data = json.loads(block)
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(data, dict):
        return None

    raw_scores = data.get("scores")
    if not isinstance(raw_scores, dict):
        return None
    scores = {
        dimension: _score(raw_scores.get(dimension)) for dimension in REVIEW_DIMENSIONS
    }
    if all(value is None for value in scores.values()):
        return None

    findings: list[dict] = []
    for raw in data.get("findings") or []:
        if not isinstance(raw, dict):
            continue
        title = _clean(raw.get("title"), 200)
        if not title:
            continue
        dimension = _clean(raw.get("dimension"), 40).lower()
        severity = _clean(raw.get("severity"), 10).lower()
        findings.append(
            {
                "dimension": dimension if dimension in REVIEW_DIMENSIONS else "clarity",
                "severity": severity if severity in _REVIEW_SEVERITIES else "medium",
                "title": title,
                "detail": _clean(raw.get("detail"), 2_000),
                "evidence": _clean(raw.get("evidence"), 300) or None,
            }
        )

    size_verdict = _clean(data.get("size_verdict"), 16).lower()
    goal_count = data.get("goal_count")
    return {
        "summary": _clean(data.get("summary"), 4_000),
        "scores": scores,
        "size_verdict": size_verdict if size_verdict in SIZE_VERDICTS else None,
        "goal_count": int(goal_count) if isinstance(goal_count, int) else None,
        "findings": findings[:_MAX_REVIEW_FINDINGS],
    }


def handle_prompt_review(job: JobRow) -> None:
    review_id = uuid.UUID(job.payload["review_id"])
    with unit_of_work() as session:
        row = session.get(PromptReviewRow, review_id)
        if row is None or row.status not in ("pending", "running"):
            return
        row.finished_at = datetime.now(UTC)
        row.duration_seconds = job.duration_seconds

        if job.status != "succeeded":
            row.status = "failed"
            row.error = job.error or "The review job did not succeed."
            return

        parsed = parse_review(job.result or "")
        if parsed is None:
            row.status = "failed"
            row.error = "The model did not return usable scores."
            return

        row.status = "done"
        row.summary = parsed["summary"] or None
        for dimension, value in parsed["scores"].items():
            setattr(row, dimension, value)
        row.size_verdict = parsed["size_verdict"]
        row.goal_count = parsed["goal_count"]
        row.findings = parsed["findings"]
        row.error = None


# --- arena runs -------------------------------------------------------------------------------

_VARIABLE_RE = re.compile(r"\{\{\s*([\w.]+)\s*\}\}")


def substitute_variables(body: str, variables: dict[str, str] | None) -> str:
    """Fill `{{name}}` placeholders. Unknown placeholders are left as-is on purpose.

    Blanking them would hide the mistake: the run would quietly test a prompt with a hole in it,
    and the output would look like a model failure rather than a missing variable.
    """
    if not variables:
        return body
    return _VARIABLE_RE.sub(
        lambda match: variables.get(match.group(1), match.group(0)), body
    )


def _usage_int(usage: dict | None, key: str) -> int | None:
    value = (usage or {}).get(key)
    return value if isinstance(value, int) else None


def handle_prompt_run(job: JobRow) -> None:
    """Settle one arena run, then start the judge if this was the last run in its batch."""
    run_id = uuid.UUID(job.payload["run_id"])
    batch_id = uuid.UUID(job.payload["batch_id"])

    with unit_of_work() as session:
        row = session.get(PromptRunRow, run_id)
        if row is None or row.status not in ("pending", "running"):
            return
        row.finished_at = datetime.now(UTC)
        row.duration_seconds = job.duration_seconds

        # Promote the engine's token accounting onto the run, the way roadmap_versions does. This is
        # the module's only source of *measured* token counts -- everything else is an estimate.
        usage = job.usage or {}
        row.input_tokens = _usage_int(usage, "input_tokens")
        row.output_tokens = _usage_int(usage, "output_tokens")
        row.cache_read_input_tokens = _usage_int(usage, "cache_read_input_tokens")
        row.cache_creation_input_tokens = _usage_int(usage, "cache_creation_input_tokens")
        row.num_turns = _usage_int(usage, "num_turns")
        cost = usage.get("total_cost_usd")
        row.total_cost_usd = float(cost) if isinstance(cost, int | float) else None

        if job.status != "succeeded":
            row.status = "failed"
            row.error = job.error or "The run did not succeed."
        else:
            row.status = "done"
            row.output = job.result or ""
            row.error = None

    # Separate unit of work: the barrier reads every run's settled status, so it must not run
    # inside the transaction that is still settling this one.
    _maybe_judge(batch_id)


def _maybe_judge(batch_id: uuid.UUID) -> None:
    """Enqueue the judge once every run in the batch has settled.

    Every run's handler calls this on the dispatcher thread, so they race. The claim is an atomic
    conditional UPDATE on the judgement row (pending -> running); only the caller whose `rowcount`
    is 1 enqueues, exactly as `council.jobs._maybe_advance` claims a round transition. Without it,
    N runs would start N judges.
    """
    with unit_of_work() as session:
        runs = list(
            session.scalars(select(PromptRunRow).where(PromptRunRow.batch_id == batch_id))
        )
        if not runs or any(run.status in ("pending", "running") for run in runs):
            return

        judgement = session.scalar(
            select(PromptJudgementRow).where(PromptJudgementRow.batch_id == batch_id)
        )
        if judgement is None:
            return  # the batch was created with judging switched off

        claimed = session.execute(
            update(PromptJudgementRow)
            .where(
                PromptJudgementRow.id == judgement.id,
                PromptJudgementRow.status == "pending",
            )
            .values(status="running")
        )
        if claimed.rowcount != 1:
            return  # another run's handler got there first

        done = [run for run in runs if run.status == "done" and (run.output or "").strip()]
        if not done:
            judgement.status = "failed"
            judgement.error = "No run produced output to judge."
            judgement.finished_at = datetime.now(UTC)
            return

        version = session.get(PromptVersionRow, judgement.version_id)
        if version is None:
            return

        from shire.domain.jobs import kinds as job_kinds
        from shire.domain.jobs.services import JobService

        job = JobService(session).enqueue(
            kind=job_kinds.PROMPT_JUDGE,
            title=f"Prompt judge: {len(done)} model(s)",
            prompt=build_judge_prompt(version, done),
            payload={
                "model": judgement.model,
                "timeout_seconds": PROMPT_ONLY_TIMEOUT_SECONDS,
                "version_id": str(version.id),
                "batch_id": str(batch_id),
                "judgement_id": str(judgement.id),
            },
        )
        judgement.job_id = job.id


# --- judge ------------------------------------------------------------------------------------

_JUDGE_SCORE_KEYS = (
    "faithfulness",
    "completeness",
    "instruction_adherence",
    "groundedness",
    "overall",
)

_OUTPUT_CHAR_BUDGET = 20_000

_JUDGE_PROMPT = """\
You are judging how well several models answered the same prompt. You are neutral: you hold no \
preference between the models and you did not write the prompt. {no_tools}

## The prompt they were all given

<prompt>
{body}
</prompt>

## The answers

{answers}

## How to judge

Score each answer 0-100 on:

- faithfulness: does it do what the prompt actually asked, rather than something adjacent?
- completeness: does it cover everything the prompt asked for?
- instruction_adherence: does it obey the stated constraints -- format, length, exclusions?
- groundedness: does it stay within what it was given, without inventing specifics?
- overall: your single summary judgement.

Judge the answers, not the prompt. Spread your scores: if two answers differ in quality, their \
numbers should differ noticeably. Pick the best answer by `run_id`; if two are genuinely \
indistinguishable, pick either and say so.

## Output

Return ONLY a single fenced json object as the very last thing, nothing after it.

```json
{{
  "summary": "3-4 sentences: how the answers differed and what separated the best from the rest",
  "winner_run_id": "the run_id of the best answer",
  "scores": [
    {{
      "run_id": "the run_id exactly as given above",
      "faithfulness": 0, "completeness": 0, "instruction_adherence": 0,
      "groundedness": 0, "overall": 0,
      "rationale": "one or two sentences on this answer specifically"
    }}
  ]
}}
```"""


def build_judge_prompt(version: PromptVersionRow, runs: list[PromptRunRow]) -> str:
    blocks = []
    for run in runs:
        output = (run.output or "")[:_OUTPUT_CHAR_BUDGET]
        blocks.append(
            f"### Answer from `{run.model}` (run_id: `{run.id}`)\n\n"
            f"<answer>\n{output}\n</answer>"
        )
    return _JUDGE_PROMPT.format(
        no_tools=_NO_TOOLS,
        body=version.body[:_BODY_CHAR_BUDGET],
        answers="\n\n".join(blocks),
    )


def parse_judgement(text: str, valid_run_ids: set[str]) -> dict | None:
    """Pull the judge's verdict out, keeping only scores for runs that were actually judged.

    `valid_run_ids` is the guard that matters: a model that invents or mangles a run_id would
    otherwise attach scores to nothing, and the arena would show a winner that does not exist.
    """
    block = extract_json_block(text)
    if block is None:
        return None
    try:
        data = json.loads(block)
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(data, dict):
        return None

    scores: list[dict] = []
    for raw in data.get("scores") or []:
        if not isinstance(raw, dict):
            continue
        run_id = _clean(raw.get("run_id"), 64)
        if run_id not in valid_run_ids:
            continue
        entry: dict = {"run_id": run_id, "rationale": _clean(raw.get("rationale"), 2_000)}
        for key in _JUDGE_SCORE_KEYS:
            entry[key] = _score(raw.get(key))
        scores.append(entry)

    if not scores:
        return None

    winner = _clean(data.get("winner_run_id"), 64)
    if winner not in valid_run_ids:
        # Fall back to the highest `overall` rather than dropping the verdict: the scores are the
        # valuable part, and a missing winner is a presentation gap, not a failure.
        ranked = [s for s in scores if s.get("overall") is not None]
        winner = max(ranked, key=lambda s: s["overall"])["run_id"] if ranked else ""

    return {
        "summary": _clean(data.get("summary"), 4_000),
        "winner_run_id": winner or None,
        "scores": scores,
    }


def handle_prompt_judge(job: JobRow) -> None:
    judgement_id = uuid.UUID(job.payload["judgement_id"])
    with unit_of_work() as session:
        row = session.get(PromptJudgementRow, judgement_id)
        if row is None or row.status not in ("pending", "running"):
            return
        row.finished_at = datetime.now(UTC)
        row.duration_seconds = job.duration_seconds

        if job.status != "succeeded":
            row.status = "failed"
            row.error = job.error or "The judge job did not succeed."
            return

        valid = {
            str(run_id)
            for run_id in session.scalars(
                select(PromptRunRow.id).where(PromptRunRow.batch_id == row.batch_id)
            )
        }
        parsed = parse_judgement(job.result or "", valid)
        if parsed is None:
            row.status = "failed"
            row.error = "The judge did not return usable scores."
            return

        row.status = "done"
        row.summary = parsed["summary"] or None
        row.scores = parsed["scores"]
        row.winner_run_id = (
            uuid.UUID(parsed["winner_run_id"]) if parsed["winner_run_id"] else None
        )
        row.error = None


def handle_prompt_suggest(job: JobRow) -> None:
    suggestion_id = uuid.UUID(job.payload["suggestion_id"])
    with unit_of_work() as session:
        row = session.get(PromptSuggestionRow, suggestion_id)
        if row is None or row.status not in ("pending", "running"):
            return  # deleted, or already settled by an earlier dispatch
        row.finished_at = datetime.now(UTC)
        row.duration_seconds = job.duration_seconds

        if job.status != "succeeded":
            row.status = "failed"
            row.error = job.error or "The suggestion job did not succeed."
            return

        parsed = parse_suggestion(job.result or "")
        if parsed is None:
            row.status = "failed"
            row.error = "The model did not return a usable rewritten prompt."
            return

        row.status = "done"
        row.summary = parsed["summary"] or None
        row.rewritten_body = parsed["rewritten_body"]
        row.changes = parsed["changes"]
        row.error = None
