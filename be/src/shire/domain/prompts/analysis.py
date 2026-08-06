"""Deterministic prompt analysis: a token estimate plus a best-practice rule pack.

Pure functions only -- no SQLAlchemy, no network, no LLM. This is what lets the workbench feel
instant: every keystroke can be scored for free, and every point deducted from the score names the
rule that took it.

Two design rules that keep this honest:

- **Length is not a defect.** Context (audience, product, quality bar, constraints *and their
  reasons*), exact scripts for fragile operations, tool contracts, prohibitions that cite a reason,
  and format-pinning examples are deliberately NOT findings. A rule pack that flags every long
  prompt is worse than no rule pack, so several rules below carry an explicit escape predicate
  (a reason marker nearby, a word-count floor) rather than firing on the pattern alone.
- **One finding per rule.** Occurrences are counted and the first match is kept as evidence, so the
  findings list stays readable and the score is simply the sum over findings.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Final

from pydantic import BaseModel, Field

SEVERITIES: Final = ("blocker", "warn", "info")

# Points removed from 100 per finding. A rule fires at most once, so even the worst realistic
# prompt lands near zero rather than going deeply negative. Weighted so a prompt carrying most of
# the anti-patterns scores in the 20s -- gentler values left it near 50, which reads as "middling"
# for text that is comprehensively dated.
_SEVERITY_PENALTY: Final[dict[str, int]] = {"blocker": 18, "warn": 9, "info": 3}

SIZE_VERDICTS: Final = ("too_small", "right", "too_big")

# Below the floor it is not a prompt yet. Above the ceiling, size is a focus question rather than a
# capacity one -- every current Claude model has a 1M-token context window.
_SUBSTANCE_FLOOR_TOKENS: Final = 15
_SMALL_TOKENS: Final = 40
_LARGE_TOKENS: Final = 8_000


class Finding(BaseModel):
    """One rule that fired, with everything the UI needs to explain itself."""

    rule_id: str
    dimension: str
    severity: str
    title: str
    detail: str
    why_it_matters: str
    occurrences: int = 1
    evidence: str | None = None


class PromptStats(BaseModel):
    characters: int
    words: int
    sentences: int
    lines: int


class StaticAnalysis(BaseModel):
    """The full deterministic verdict for one prompt body."""

    estimated_input_tokens: int
    score: int = Field(ge=0, le=100)
    size_verdict: str
    goal_count: int
    stats: PromptStats
    findings: list[Finding]


# --- token estimation -------------------------------------------------------------------------

_WORD_RE: Final = re.compile(r"[A-Za-z0-9']+")
# Runs of adjacent ASCII punctuation, not individual marks -- see estimate_tokens.
_PUNCT_RUN_RE: Final = re.compile(r"[!-/:-@\[-`{-~]+")
_NON_ASCII_RE: Final = re.compile(r"[^\x00-\x7f]")


def estimate_tokens(text: str) -> int:
    """Approximate the Claude input-token count for `text`.

    There is no offline Anthropic tokenizer, and OpenAI's `tiktoken` is the wrong tokenizer for
    Claude (it undercounts by 15-20%, worse on code), so a documented approximation beats a
    confident wrong number. Exact counts arrive in `jobs.usage.input_tokens` after any real run and
    the UI shows both.

    The model, calibrated so English prose lands near the real 4-characters-per-token rate:

    - each word costs one token per ~4.2 characters, minimum one (BPE splits long words);
    - each *run* of adjacent punctuation costs one token, not one per mark -- BPE merges `", "` and
      `":` into single tokens, and charging per character over-counts JSON by nearly 40%;
    - each newline costs half a token (it usually merges with surrounding whitespace);
    - every non-ASCII character costs a full token, which is about right for CJK and emoji.

    A characters/5.5 floor is a backstop for pathological input the word model cannot see.
    """
    if not text:
        return 0

    word_tokens = sum(max(1, round(len(word) / 4.2)) for word in _WORD_RE.findall(text))
    punct_runs = len(_PUNCT_RUN_RE.findall(text))
    newlines = text.count("\n")
    non_ascii = len(_NON_ASCII_RE.findall(text))

    estimate = word_tokens + punct_runs + newlines * 0.5 + non_ascii
    return max(1, round(max(estimate, len(text) / 5.5)))


# --- shared helpers ---------------------------------------------------------------------------

_SENTENCE_SPLIT_RE: Final = re.compile(r"(?<=[.!?])\s+|\n+")
_REASON_RE: Final = re.compile(
    r"\b(?:because|so that|otherwise|since|in order to|to avoid|which would|the reason)\b",
    re.IGNORECASE,
)


def _sentences(text: str) -> list[str]:
    return [part.strip() for part in _SENTENCE_SPLIT_RE.split(text) if part.strip()]


def _normalise(sentence: str) -> str:
    return " ".join(_WORD_RE.findall(sentence.lower()))


def _snippet(text: str, limit: int = 120) -> str:
    """One-line evidence excerpt, whitespace collapsed."""
    collapsed = " ".join(text.split())
    return collapsed if len(collapsed) <= limit else collapsed[: limit - 3] + "..."


# --- regex-countable rules --------------------------------------------------------------------


@dataclass(frozen=True)
class _PatternRule:
    """A rule that fires when `pattern` matches at least `threshold` times.

    `detail` is formatted with `count` and `evidence`.
    """

    rule_id: str
    dimension: str
    severity: str
    title: str
    why_it_matters: str
    pattern: re.Pattern[str]
    detail: str
    threshold: int = 1


_PATTERN_RULES: Final[tuple[_PatternRule, ...]] = (
    _PatternRule(
        rule_id="pressure_language",
        dimension="pressure",
        severity="warn",
        title="Shouted emphasis",
        why_it_matters=(
            "Current Claude models follow the prompt closely. Emphasis written to overcome an "
            "older model's reluctance now over-applies, and when several instructions are all "
            "marked critical the marker stops carrying information."
        ),
        pattern=re.compile(r"\b(?:MUST|NEVER|ALWAYS|CRITICAL|IMPORTANT|REQUIRED|DO NOT)\b|!!"),
        threshold=3,
        detail=(
            "{count} shouted directives. State the one or two real constraints plainly, with the "
            "reason, and drop the rest to normal volume."
        ),
    ),
    _PatternRule(
        rule_id="hedged_requirement",
        dimension="pressure",
        severity="warn",
        title="Requirements phrased as suggestions",
        why_it_matters=(
            "A hedge on something you actually require reads literally as permission to skip it."
        ),
        pattern=re.compile(
            r"\b(?:try to|if possible|ideally|where possible|attempt to|feel free to)\b",
            re.IGNORECASE,
        ),
        detail="{count} hedged instruction(s). If it is required, say so plainly.",
    ),
    _PatternRule(
        rule_id="dated_scaffold",
        dimension="dated",
        severity="warn",
        title="Scaffolding for older models",
        why_it_matters=(
            "These incantations predate trained-in reasoning and structured outputs. On current "
            "models they are redundant at best; control reasoning depth with model settings."
        ),
        pattern=re.compile(
            r"think step[-\s]?by[-\s]?step|take a deep breath|</?scratchpad>|</?thinking>"
            r"|output only valid json|respond only with json|you are an ai language model",
            re.IGNORECASE,
        ),
        detail="{count} dated scaffold(s), e.g. {evidence!r}.",
    ),
    _PatternRule(
        rule_id="deprecated_parameter",
        dimension="dated",
        severity="warn",
        title="Mentions removed API parameters",
        why_it_matters=(
            "budget_tokens, temperature, top_p and top_k are rejected by current Claude models. A "
            "prompt that discusses them is describing an API that no longer exists."
        ),
        pattern=re.compile(r"\b(?:budget_tokens|temperature|top_p|top_k)\b"),
        detail="References {evidence!r}.",
    ),
    _PatternRule(
        rule_id="assistant_prefill",
        dimension="dated",
        severity="warn",
        title="Assistant-turn prefill",
        why_it_matters=(
            "Prefilling the final assistant turn returns a 400 on current Claude models. Use a "
            "structured output format, or say plainly what shape you want back."
        ),
        pattern=re.compile(
            r"(?mi)^\s*assistant:\s*$|\"role\"\s*:\s*\"assistant\"\s*\}?\s*$",
        ),
        detail="Looks like a prefill shape.",
    ),
    _PatternRule(
        rule_id="retired_model_reference",
        dimension="stale",
        severity="warn",
        title="Names a retired model",
        why_it_matters=(
            "A prompt pinned to a model that no longer exists silently degrades: the guidance was "
            "tuned for behaviour the current model does not have."
        ),
        pattern=re.compile(
            r"\bclaude-2(?:\.\d)?\b|\bclaude-instant\b|\bclaude-3\b|\bclaude-3-[a-z]"
            r"|\bgpt-4\b|\bgpt-3\.5\b|\bsonnet 3\.[57]\b",
            re.IGNORECASE,
        ),
        detail="References {evidence!r}.",
    ),
    _PatternRule(
        rule_id="migration_relative_phrasing",
        dimension="stale",
        severity="info",
        title="Phrased as a diff against an older prompt",
        why_it_matters=(
            "The model never saw the previous version, so 'no longer' and 'instead of before' "
            "imply alternatives it cannot see. Write the current rule as the only rule."
        ),
        pattern=re.compile(
            r"\b(?:no longer|now works differently|instead of before|as of now|previously,)\b",
            re.IGNORECASE,
        ),
        detail="{count} relative phrase(s), e.g. {evidence!r}.",
    ),
    _PatternRule(
        rule_id="step_choreography",
        dimension="over_specification",
        severity="warn",
        title="Step-by-step choreography",
        why_it_matters=(
            "Scripting the method for a judgement task constrains the model to your plan, which is "
            "usually worse than its own. Keep numbered steps only where the order is genuinely "
            "load-bearing; otherwise state the outcome and how to verify it."
        ),
        pattern=re.compile(r"(?mi)^\s*\**\s*step\s+\d"),
        threshold=3,
        detail="{count} explicit STEP markers.",
    ),
    _PatternRule(
        rule_id="numeric_output_clamp",
        dimension="over_specification",
        severity="info",
        title="Hard numeric output cap",
        why_it_matters=(
            "Word and sentence ceilings tuned against an older model's verbosity starve reasoning "
            "on hard inputs. Describe the audience and the shape instead of counting words."
        ),
        pattern=re.compile(
            r"\b(?:at most|no more than|under|maximum of|max)\s+\d+\s*"
            r"(?:words?|sentences?|characters?|chars?|bullets?|lines?|paragraphs?)\b",
            re.IGNORECASE,
        ),
        detail="Caps output at a fixed count ({evidence!r}).",
    ),
    _PatternRule(
        rule_id="cadence_choreography",
        dimension="over_specification",
        severity="info",
        title="Fixed progress-update cadence",
        why_it_matters=(
            "Current models narrate progress appropriately on their own; a fixed cadence produces "
            "mechanical filler."
        ),
        pattern=re.compile(r"every\s+\d+\s+(?:tool calls?|messages?|steps?|turns?)", re.IGNORECASE),
        detail="Forces updates on a fixed interval ({evidence!r}).",
    ),
    _PatternRule(
        rule_id="grader_vocabulary",
        dimension="over_specification",
        severity="warn",
        title="Describes the grader instead of the requirement",
        why_it_matters=(
            "Talking about scoring pushes effort toward looking watched. State every requirement "
            "the grader checks, and never mention the grader."
        ),
        pattern=re.compile(
            r"\b(?:you will be graded|graded on|hidden tests?|scoring rubric|the grader)\b",
            re.IGNORECASE,
        ),
        detail="Mentions grading ({evidence!r}).",
    ),
    _PatternRule(
        rule_id="unresolved_placeholder",
        dimension="substance",
        severity="blocker",
        title="Unfilled placeholder",
        why_it_matters=(
            "A placeholder that reaches the model is read as literal text, so the instruction "
            "silently loses its subject."
        ),
        pattern=re.compile(
            r"\[(?:INSERT|TODO|YOUR|FILL|PLACEHOLDER)[^\]]*\]|\bTODO\b|\bFIXME\b|\bXXX\b"
        ),
        detail="{count} unfilled placeholder(s), e.g. {evidence!r}.",
    ),
    _PatternRule(
        rule_id="template_variable",
        dimension="substance",
        severity="info",
        title="Template variables present",
        why_it_matters="Not a defect -- a reminder that these are substituted, not sent literally.",
        pattern=re.compile(r"\{\{\s*[\w.]+\s*\}\}"),
        detail=(
            "{count} template variable(s), e.g. {evidence!r}. Supply values when you test the "
            "prompt."
        ),
    ),
)


def _pattern_findings(body: str) -> list[Finding]:
    findings: list[Finding] = []
    for rule in _PATTERN_RULES:
        matches = rule.pattern.findall(body)
        if len(matches) < rule.threshold:
            continue
        first = rule.pattern.search(body)
        evidence = _snippet(first.group(0)) if first else None
        findings.append(
            Finding(
                rule_id=rule.rule_id,
                dimension=rule.dimension,
                severity=rule.severity,
                title=rule.title,
                detail=rule.detail.format(count=len(matches), evidence=evidence),
                why_it_matters=rule.why_it_matters,
                occurrences=len(matches),
                evidence=evidence,
            )
        )
    return findings


# --- structural rules -------------------------------------------------------------------------

# Verbs that open a distinct ask. Used to count goals, not to police wording.
_GOAL_VERBS: Final = frozenset(
    {
        "analyse", "analyze", "assess", "audit", "classify", "compare", "compile", "convert",
        "create", "critique", "debug", "define", "describe", "design", "diagnose", "draft",
        "estimate", "evaluate", "explain", "extract", "generate", "identify", "implement",
        "improve", "list", "outline", "plan", "predict", "produce", "propose", "rank",
        "recommend", "refactor", "research", "review", "rewrite", "score", "sort", "summarise",
        "summarize", "translate", "validate", "verify", "write",
    }
)

_OUTPUT_CONTRACT_RE: Final = re.compile(
    r"\b(?:output|format|return|respond with|reply with|json|yaml|markdown|table|schema"
    r"|structure|sections?|bullets?|headings?)\b",
    re.IGNORECASE,
)
_PURPOSE_RE: Final = re.compile(
    r"\b(?:audience|reader|for a |for an |so that|goal|purpose|because|context|they need"
    r"|will be used|end user)\b",
    re.IGNORECASE,
)
_STRUCTURED_ASK_RE: Final = re.compile(r"\b(?:json|yaml|csv|xml|table)\b", re.IGNORECASE)
_EXAMPLE_RE: Final = re.compile(r"```|\bfor example\b|\be\.g\.|\bexample:", re.IGNORECASE)
_IDENTITY_STUB_RE: Final = re.compile(
    r"^\s*you are (?:a|an) (?:helpful|expert|professional|skilled|experienced)\b",
    re.IGNORECASE,
)
_PROHIBITION_LINE_RE: Final = re.compile(
    r"^\s*(?:[-*+]\s*)?(?:do not|don't|never|avoid)\b", re.IGNORECASE
)
_VOLATILE_RE: Final = re.compile(
    r"\d{4}-\d{2}-\d{2}|\d{2}:\d{2}:\d{2}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}"
    r"|current (?:date|time)|datetime\.now|Date\.now|\btoday'?s date\b",
    re.IGNORECASE,
)


def _count_goals(body: str) -> int:
    """Distinct top-level asks, by the leading verb of each sentence or bullet."""
    found: set[str] = set()
    for sentence in _sentences(body):
        words = _WORD_RE.findall(sentence.lower())
        for candidate in words[:2]:
            if candidate in _GOAL_VERBS:
                found.add(candidate)
                break
    return len(found)


def _prohibition_pileup(body: str) -> Finding | None:
    """A run of 3+ consecutive prohibitions where none carries a reason.

    The reason check is the keep-list guard: reasoned constraints are exactly the content a good
    prompt has, so only unexplained pile-ups are flagged.
    """
    run: list[str] = []
    worst: list[str] = []
    for line in body.splitlines():
        if _PROHIBITION_LINE_RE.match(line):
            run.append(line)
            if len(run) > len(worst):
                worst = list(run)
        else:
            run = []
    if len(worst) < 3 or any(_REASON_RE.search(line) for line in worst):
        return None
    return Finding(
        rule_id="prohibition_pileup",
        dimension="over_specification",
        severity="warn",
        title="Unexplained prohibition pile-up",
        detail=f"{len(worst)} consecutive prohibitions, none of which says why.",
        why_it_matters=(
            "Describing success beats enumerating failure, and a prohibition against a mistake the "
            "model was not going to make can anchor it toward that mistake. Prohibitions that "
            "carry a reason are fine -- these do not."
        ),
        occurrences=len(worst),
        evidence=_snippet(worst[0]),
    )


def _repetition(body: str) -> Finding | None:
    """Near-duplicate sentences, by word-shingle overlap."""
    candidates = [
        (normalised, raw)
        for normalised, raw in ((_normalise(s), s) for s in _sentences(body))
        if len(normalised.split()) >= 6
    ]
    for index, (left, raw) in enumerate(candidates):
        left_words = set(left.split())
        for right, _ in candidates[index + 1 :]:
            right_words = set(right.split())
            union = left_words | right_words
            if union and len(left_words & right_words) / len(union) >= 0.8:
                return Finding(
                    rule_id="repetition",
                    dimension="substance",
                    severity="warn",
                    title="Repeated instruction",
                    detail="Two sentences say nearly the same thing.",
                    why_it_matters=(
                        "Duplicated rules drift apart as one copy is edited, and the model spends "
                        "effort reconciling the wordings. Say it once, in the right place."
                    ),
                    evidence=_snippet(raw),
                )
    return None


def _structural_findings(body: str, tokens: int, stats: PromptStats, goals: int) -> list[Finding]:
    findings: list[Finding] = []

    if tokens < _SUBSTANCE_FLOOR_TOKENS:
        findings.append(
            Finding(
                rule_id="no_substance",
                dimension="substance",
                severity="blocker",
                title="Not enough to act on",
                detail=f"About {tokens} tokens. There is no task, context or output shape here.",
                why_it_matters=(
                    "With nothing specific to go on the model fills the gaps with safe defaults, "
                    "which is where generic output comes from."
                ),
            )
        )

    if _IDENTITY_STUB_RE.match(body) and stats.words < 40:
        findings.append(
            Finding(
                rule_id="identity_stub_only",
                dimension="structure",
                severity="warn",
                title="Role line standing in for context",
                detail="Opens with a generic persona and adds little task-specific detail.",
                why_it_matters=(
                    "A one-line role is fine as a focus-setter. The problem is when it replaces "
                    "the audience, the product and the quality bar -- the things only you know."
                ),
                evidence=_snippet(body[:120]),
            )
        )

    if stats.words >= 25 and not _OUTPUT_CONTRACT_RE.search(body):
        findings.append(
            Finding(
                rule_id="no_output_contract",
                dimension="structure",
                severity="warn",
                title="No output shape described",
                detail="Nothing says what form the answer should take.",
                why_it_matters=(
                    "Without a stated shape you get whatever the model judges appropriate, which "
                    "varies run to run and is the most common cause of unparseable output."
                ),
            )
        )

    if stats.words >= 40 and not _PURPOSE_RE.search(body):
        findings.append(
            Finding(
                rule_id="no_audience_or_purpose",
                dimension="structure",
                severity="info",
                title="No audience or purpose",
                detail="The prompt says what to do but not who it is for or why.",
                why_it_matters=(
                    "Purpose is context the model cannot infer, and it is what lets it make the "
                    "judgement calls you did not spell out."
                ),
            )
        )

    if _STRUCTURED_ASK_RE.search(body) and not _EXAMPLE_RE.search(body):
        findings.append(
            Finding(
                rule_id="no_example_for_structured_ask",
                dimension="structure",
                severity="info",
                title="Structured output asked for without an example",
                detail="A specific format is requested but no example of it is shown.",
                why_it_matters=(
                    "For format-sensitive output one concrete example pins the shape far more "
                    "reliably than a prose description of it."
                ),
            )
        )

    if goals > 3:
        findings.append(
            Finding(
                rule_id="multi_goal",
                dimension="substance",
                severity="warn",
                title=f"{goals} separate goals in one prompt",
                detail="Several distinct asks are bundled together.",
                why_it_matters=(
                    "Competing goals get partially served each. Splitting them into separate "
                    "prompts, or naming one as primary, usually beats asking for all at once."
                ),
            )
        )

    head = body[: max(200, len(body) // 3)]
    if (volatile := _VOLATILE_RE.search(head)) is not None:
        evidence = _snippet(volatile.group(0))
        findings.append(
            Finding(
                rule_id="cache_hostile_volatility",
                dimension="cache",
                severity="info",
                title="Volatile content near the top",
                detail=f"Found {evidence!r} early in the prompt.",
                why_it_matters=(
                    "Prompt caching is a prefix match, so a timestamp or id near the front "
                    "invalidates everything after it on every call. Move it to the end."
                ),
                evidence=evidence,
            )
        )

    if tokens > _LARGE_TOKENS:
        findings.append(
            Finding(
                rule_id="too_big",
                dimension="size",
                severity="warn",
                title="Very large prompt",
                detail=f"About {tokens} tokens.",
                why_it_matters=(
                    "Not a context-window problem -- a focus one. Reference material this large "
                    "is usually better supplied as a file or a tool result than inlined per call."
                ),
            )
        )
    elif _SUBSTANCE_FLOOR_TOKENS <= tokens < _SMALL_TOKENS:
        findings.append(
            Finding(
                rule_id="too_small",
                dimension="size",
                severity="info",
                title="Very short prompt",
                detail=f"About {tokens} tokens.",
                why_it_matters=(
                    "Short prompts produce generic output because the model fills the gaps itself. "
                    "Adding audience, constraints and an output shape is usually the cheapest win."
                ),
            )
        )

    return findings


def size_verdict(tokens: int) -> str:
    """Bucket a token count. Public because version rows store the count, not the verdict."""
    if tokens > _LARGE_TOKENS:
        return "too_big"
    if tokens < _SMALL_TOKENS:
        return "too_small"
    return "right"


def analyse(body: str) -> StaticAnalysis:
    """Score `body` against the rule pack. Deterministic, instant, and free."""
    tokens = estimate_tokens(body)
    sentences = _sentences(body)
    stats = PromptStats(
        characters=len(body),
        words=len(_WORD_RE.findall(body)),
        sentences=len(sentences),
        lines=len(body.splitlines()),
    )
    goals = _count_goals(body)

    findings = _pattern_findings(body)
    if (pileup := _prohibition_pileup(body)) is not None:
        findings.append(pileup)
    if (repeat := _repetition(body)) is not None:
        findings.append(repeat)
    findings.extend(_structural_findings(body, tokens, stats, goals))

    order = {severity: index for index, severity in enumerate(SEVERITIES)}
    findings.sort(key=lambda f: (order.get(f.severity, len(SEVERITIES)), f.rule_id))

    penalty = sum(_SEVERITY_PENALTY.get(finding.severity, 0) for finding in findings)
    return StaticAnalysis(
        estimated_input_tokens=tokens,
        score=max(0, 100 - penalty),
        size_verdict=size_verdict(tokens),
        goal_count=goals,
        stats=stats,
        findings=findings,
    )
