"""Diff-scoped prompts: the MR hobit engine + the pipeline-owned classification/overview prompts.

Mirrors `hobits/repo_hobit.py` — fixed preamble, editable instructions, fixed JSON contract — but
the subject is a branch-pair diff, not the whole repository. The clone's working tree is typically
checked out near the *target* branch, so every prompt states that the diff is authoritative and
the tree is surrounding context.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from shire.domain.hobits.domain import HobitSpec
from shire.domain.hobits.repo_hobit import extract_json_block
from shire.domain.merge_review.domain import (
    ClassificationLabel,
    Footprint,
    MrHobitOutput,
    MrLabel,
)


@dataclass(frozen=True)
class MrContext:
    """What every MR prompt is handed."""

    repo_slug: str
    source_branch: str
    target_branch: str
    clone_path: str
    context_markdown: str
    footprint_summary: str
    diff_excerpt: str


# Fixed: orients the agent on the MR. Wraps the hobit's editable instructions.
_MR_PREAMBLE = """\
You are reviewing a merge request on repository **{repo_slug}**: branch `{source_branch}` \
merging into `{target_branch}`. The diff below is authoritative — review exactly these changes. \
The working tree in your current directory is checked out near the target branch; use your Read, \
Grep and Glob tools to inspect surrounding code (callers, tests, conventions) when the diff alone \
is not enough.

A precomputed repository context snapshot is provided to orient you:

<context>
{context_markdown}
</context>

Change footprint:
{footprint_summary}

The diff (may be truncated; the footprint above covers every file):
<diff>
{diff_excerpt}
</diff>"""

# Fixed: the strict JSON contract the parser depends on. Never user-editable.
_MR_OUTPUT_CONTRACT = """\
Then report your findings as structured review comments. Severity semantics: critical = would \
break production or leak data, must not merge; major = a real defect or serious risk; minor = \
worth fixing, not blocking; info = observation. self_score is 0-100: how serious your most \
important finding is (empty comments → score it low).

Return ONLY a single fenced json block as the very last thing in your response, nothing after \
it. Comment bodies are JSON strings (escape quotes/newlines); cite exact file paths from the \
diff; invent nothing. If nothing is wrong through your lens, return an empty comments list. Shape:
```json
{{"headline": "<one sentence>", "self_score": 0, "comments": [{{"severity": \
"info|minor|major|critical", "file": "<path or null>", "line": null, "body": "<markdown>"}}]}}
```"""


class MrHobit:
    """A hobit reviewing a diff, driven by its spec (charter + instructions)."""

    def __init__(self, spec: HobitSpec) -> None:
        self.spec = spec

    def build_prompt(self, ctx: MrContext, instructions: str) -> str:
        return f"{_preamble(ctx)}\n\n{instructions}\n\n{_MR_OUTPUT_CONTRACT}"

    def parse_output(self, text: str) -> MrHobitOutput | None:
        block = extract_json_block(text)
        if block is None:
            return None
        try:
            return MrHobitOutput.model_validate(json.loads(block))
        except (json.JSONDecodeError, ValueError):
            return None


# --- pipeline-owned prompts (not roster hobits; not user-tunable) -----------------------------

_CLASSIFICATION_CONTRACT = """\
Classify what this MR consists of, as proportions of the change. Vocabulary (use only these \
labels): bug_fix, new_feature, refactoring, docs, tests, chore, config. An MR can mix several — \
report every label that genuinely applies with its rough share (proportions sum to 1).

Return ONLY a single fenced json block as the very last thing in your response. Shape:
```json
{{"labels": [{{"label": "bug_fix", "proportion": 0.6}}, {{"label": "tests", "proportion": 0.4}}]}}
```"""

_OVERVIEW_CONTRACT = """\
Write the "MR overview for humans": 200-400 words of plain Markdown telling a busy reviewer what \
these changes actually do — what changed, why it appears to have changed, and what to look at \
first. Ground every claim in the diff; invent nothing; no headings deeper than ###.

Return ONLY a single fenced json block as the very last thing in your response. Shape:
```json
{{"overview": "<the markdown, as an escaped JSON string>"}}
```"""


def build_classification_prompt(ctx: MrContext) -> str:
    return f"{_preamble(ctx)}\n\n{_CLASSIFICATION_CONTRACT}"


def parse_classification(text: str) -> list[ClassificationLabel] | None:
    """Validated labels with renormalized proportions; unknown labels are dropped."""
    block = extract_json_block(text)
    if block is None:
        return None
    try:
        raw = json.loads(block).get("labels", [])
    except (json.JSONDecodeError, AttributeError):
        return None
    labels: list[ClassificationLabel] = []
    for entry in raw:
        if not isinstance(entry, dict) or entry.get("label") not in MrLabel.__members__:
            continue
        labels.append(ClassificationLabel.model_validate(entry))
    total = sum(label.proportion for label in labels)
    if not labels or total <= 0:
        return None
    for label in labels:
        label.proportion = round(label.proportion / total, 3)
    return sorted(labels, key=lambda entry: -entry.proportion)


def build_overview_prompt(ctx: MrContext) -> str:
    return f"{_preamble(ctx)}\n\n{_OVERVIEW_CONTRACT}"


def parse_overview(text: str) -> str | None:
    block = extract_json_block(text)
    if block is None:
        return None
    try:
        overview = json.loads(block).get("overview")
    except (json.JSONDecodeError, AttributeError):
        return None
    return overview if isinstance(overview, str) and overview.strip() else None


_PRINCIPLE_CONTRACT = """\
## The principle
**{name}** (severity: {severity})

{statement}

## Your job
Decide whether **the changes in this merge request** uphold or violate that principle. You are \
judging the diff, not the repository:

- A pre-existing violation somewhere else in the codebase is **not** this MR's fault. Do not \
report it. Judge only what these changes do.
- If the diff introduces a violation, makes an existing one worse, or extends a \
non-conforming pattern into new code, the verdict is `violated` — cite the changed lines.
- If the principle has nothing to say about these changes, the verdict is `upheld`. Say so \
plainly in the summary rather than inventing a concern.
- If the diff *fixes* a violation, that is `upheld` — mention it, it is worth knowing.

Every file you cite must be a file this MR changes. Read the surrounding code when the diff \
alone cannot tell you whether the principle holds (e.g. the rule concerns a convention you need \
to see elsewhere to judge). List at most {max_violations} violations, most important first.

Return ONLY a single fenced json object as the very last thing, nothing else:
```json
{{
  "verdict": "upheld" or "violated",
  "summary": "2-3 sentences: your finding about THIS change and how you verified it",
  "violations": [
    {{"file": "path/changed/by/this/mr.py", "line": 42, "explanation": "what this change breaks"}}
  ]
}}
```
`violations` must be empty when the verdict is "upheld". `line` may be null."""


def build_principle_check_prompt(
    ctx: MrContext, *, name: str, severity: str, statement: str, max_violations: int
) -> str:
    """Ask one principle of one diff. Deliberately not the repo-wide audit prompt from
    `principles/jobs.py`: that one asks "does this codebase comply", which on a merge request
    would report the whole backlog of pre-existing violations as if the MR caused them."""
    return f"{_preamble(ctx)}\n\n" + _PRINCIPLE_CONTRACT.format(
        name=name,
        severity=severity,
        statement=statement,
        max_violations=max_violations,
    )


def footprint_summary(fp: Footprint) -> str:
    """A compact markdown rendering of the footprint, embedded in every MR prompt."""
    lines = [
        f"- Size: **{fp.size.value}** — {fp.files_changed} files, "
        f"+{fp.total_additions}/-{fp.total_deletions} lines, {fp.commit_count} commits, "
        f"{fp.author_count} author(s)",
        f"- Tests vs code: {fp.test_lines_changed} test lines vs {fp.code_lines_changed} "
        f"code lines changed"
        + (f" (ratio {fp.tests_to_code_ratio})" if fp.tests_to_code_ratio is not None else ""),
    ]
    if fp.hotspot_paths_touched:
        lines.append(
            "- Touches known hotspots (historically churn-heavy files): "
            + ", ".join(f"`{p}`" for p in fp.hotspot_paths_touched)
        )
    top = sorted(fp.files, key=lambda f: -(f.additions + f.deletions))[:10]
    lines.append("- Most-changed files:")
    for f in top:
        marks = "".join(
            label
            for flag, label in (
                (f.is_new, " (new)"),
                (f.is_deleted, " (deleted)"),
                (f.old_path is not None, f" (renamed from {f.old_path})"),
                (f.is_binary, " (binary)"),
                (f.is_test, " (test)"),
            )
            if flag
        )
        lines.append(f"  - `{f.path}` +{f.additions}/-{f.deletions}{marks}")
    if len(fp.files) > len(top):
        lines.append(f"  - … and {len(fp.files) - len(top)} more files")
    return "\n".join(lines)


def _preamble(ctx: MrContext) -> str:
    return _MR_PREAMBLE.format(
        repo_slug=ctx.repo_slug,
        source_branch=ctx.source_branch,
        target_branch=ctx.target_branch,
        context_markdown=ctx.context_markdown,
        footprint_summary=ctx.footprint_summary,
        diff_excerpt=ctx.diff_excerpt,
    )
