"""Generic repo-scoped hobit: run `claude -p` in a repo clone, produce a document + self-score.

Every analysis hobit shares the same shape — a fixed preamble (repo + tools + context snapshot),
the hobit's editable **instructions** (what to produce), and a fixed output contract (the strict
JSON the parser depends on). A hobit is therefore just a `HobitSpec` (its charter + instructions);
this class supplies the shared run logic.
"""

from __future__ import annotations

import json
import re
from collections.abc import Sequence

from shire.domain.hobits.domain import FeedbackEntry, HobitContext, HobitOutput, HobitSpec

# Fixed: orients the agent (repo + tools + context). Wraps the editable instructions.
_PREAMBLE = """\
You are working on the repository **{repo_slug}**. Its working tree is your current directory — \
use your Read, Grep and Glob tools to inspect the real files before you conclude anything.

A precomputed context snapshot (metrics, hotspots, dependencies, tool findings) is provided to \
orient you:

<context>
{context_markdown}
</context>"""

# The feedback cycle: standing guidance (distilled) + recent raw ratings, injected between the
# instructions and the output contract whenever they exist. Absent feedback leaves the prompt
# byte-identical to the pre-feedback shape.
_GUIDANCE_SECTION = """\
## Standing guidance from your user

Distilled from the user's ratings of your previous reports across all repositories. Follow it \
in this run:

{guidance}"""

_FEEDBACK_SECTION = """\
## User feedback on your previous responses

The user rated some of your recent reports 1-5 stars (newest first, from any repository). \
Calibrate this run accordingly — keep doing what earned high ratings, fix what earned low ones:

{entries}"""

_MAX_COMMENT_CHARS = 500
_MAX_HEADLINE_CHARS = 200


def _clip(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit].rstrip() + "…"


def format_feedback_entries(entries: Sequence[FeedbackEntry]) -> str:
    lines = []
    for e in entries:
        line = f"- [{e.rating}/5] {e.repository_slug}"
        if e.headline:
            line += f' — report: "{_clip(e.headline, _MAX_HEADLINE_CHARS)}"'
        if e.comment:
            line += f" — comment: {_clip(e.comment, _MAX_COMMENT_CHARS)}"
        lines.append(line)
    return "\n".join(lines)


# Fixed: the self-score + strict JSON contract the parser depends on. Never user-editable.
_OUTPUT_CONTRACT = """\
Then self-assess your finding for the briefing feed, as integers 0-100:
- importance: how much this matters to the repository's owner.
- confidence: how sure you are your findings are accurate.
- urgency: how time-sensitive acting on them is.

Return ONLY a single fenced json block as the very last thing in your response, nothing after it. \
The narrative value must be a JSON string (escape any quotes/newlines); do not put ``` fences \
inside it. Shape:
```json
{{"headline": "<one sentence>", "narrative": "<the full markdown document>", \
"self_score": {{"importance": 0, "confidence": 0, "urgency": 0}}}}
```"""


class RepoHobit:
    """A hobit driven entirely by its spec (charter + instructions)."""

    def __init__(self, spec: HobitSpec) -> None:
        self.spec = spec

    def build_prompt(self, ctx: HobitContext, instructions: str) -> str:
        preamble = _PREAMBLE.format(
            repo_slug=ctx.repo_slug, context_markdown=ctx.context_markdown
        )
        parts = [preamble, instructions]
        if ctx.learned_guidance:
            parts.append(_GUIDANCE_SECTION.format(guidance=ctx.learned_guidance))
        if ctx.feedback_entries:
            parts.append(
                _FEEDBACK_SECTION.format(entries=format_feedback_entries(ctx.feedback_entries))
            )
        parts.append(_OUTPUT_CONTRACT)  # must stay last — the parser reads the trailing JSON
        return "\n\n".join(parts)

    def parse_output(self, text: str) -> HobitOutput | None:
        block = extract_json_block(text)
        if block is None:
            return None
        try:
            return HobitOutput.model_validate(json.loads(block))
        except (json.JSONDecodeError, ValueError):
            return None


def extract_json_block(text: str) -> str | None:
    """Pull the final JSON object out of the agent's text.

    Prefer the last ```json fenced block (robust to fences inside the narrative, since those are
    escaped within the JSON string); fall back to a bare trailing JSON object.
    """
    marker = text.rfind("```json")
    if marker != -1:
        after = text.find("\n", marker)
        close = text.rfind("```")
        if after != -1 and close > after:
            return text[after:close].strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    return match.group(0) if match else None
