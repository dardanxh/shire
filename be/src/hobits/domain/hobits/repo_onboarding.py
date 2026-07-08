"""The Repo-Onboarding hobit — writes an L3 "mental model" of a repository.

It runs `claude -p` in the clone (native Read/Grep/Glob), seeded with the precomputed context pack,
and must return one fenced JSON block with the narrative + a self-score. Two parts of the prompt are
editable config (the **charter** = persona/system prompt, and the **instructions** = what to
produce); a fixed preamble + output contract wrap them so structured-output parsing stays reliable.
"""

from __future__ import annotations

import json
import re

from hobits.domain.hobits.domain import HobitContext, HobitOutput, HobitSpec

DEFAULT_CHARTER = (
    "You are the Repo-Onboarding hobit — an expert staff engineer who rapidly builds an "
    "accurate mental model of an unfamiliar codebase for a busy data engineer. You are precise "
    "and concrete, you read real files before claiming anything, and you cite exact paths. You "
    "care about what the repo does, how it is organized, its data/control flow, its risky parts, "
    "and the conventions a newcomer must follow. You never invent files or features."
)

# Editable: WHAT the hobit should produce. Change this to change the hobit's behavior.
DEFAULT_INSTRUCTIONS = """\
Produce a concise but substantive **L3 mental model** of this repository, in Markdown:
- What it does and who/what uses it (1-2 short paragraphs).
- How it is organized: the ~5 files or modules that matter most and why (use the hotspots and your
own reading).
- The core data/control flow.
- The scary parts / risks (complexity, security, fragile areas), grounded in the snapshot + code.
- Conventions a newcomer must follow.
Aim for ~300-600 words. Cite real paths. Do not invent anything."""

# Fixed: orients the agent (repo + tools + context). Wraps the editable instructions.
_PREAMBLE = """\
You are onboarding onto the repository **{repo_slug}**. Its working tree is your current directory \
— use your Read, Grep and Glob tools to inspect the real files before you conclude anything.

A precomputed context snapshot (metrics, hotspots, dependencies, tool findings) is provided to \
orient you:

<context>
{context_markdown}
</context>"""

# Fixed: the self-score + strict JSON contract the parser depends on. Never user-editable.
_OUTPUT_CONTRACT = """\
Then self-assess this finding for a daily briefing, as integers 0-100:
- importance: how much this matters to the repository's owner.
- confidence: how sure you are the produced document is accurate.
- urgency: how time-sensitive acting on it is.

Return ONLY a single fenced json block as the very last thing in your response, nothing after it. \
The narrative value must be a JSON string (escape any quotes/newlines); do not put ``` fences \
inside it. Shape:
```json
{{"headline": "<one sentence>", "narrative": "<the full markdown document>", \
"self_score": {{"importance": 0, "confidence": 0, "urgency": 0}}}}
```"""


class RepoOnboardingHobit:
    spec = HobitSpec(
        slug="repo-onboarding",
        name="Repo Onboarding",
        description=(
            "Explores a repository and writes an L3 mental model — what it does, the files that "
            "matter, the data flow, the scary parts, and its conventions."
        ),
        layer="L3",
        default_charter=DEFAULT_CHARTER,
        default_instructions=DEFAULT_INSTRUCTIONS,
        default_model="sonnet",
        default_timeout_seconds=180.0,
    )

    def build_prompt(self, ctx: HobitContext, instructions: str) -> str:
        preamble = _PREAMBLE.format(
            repo_slug=ctx.repo_slug, context_markdown=ctx.context_markdown
        )
        return f"{preamble}\n\n{instructions}\n\n{_OUTPUT_CONTRACT}"

    def parse_output(self, text: str) -> HobitOutput | None:
        block = _extract_json_block(text)
        if block is None:
            return None
        try:
            data = json.loads(block)
            return HobitOutput.model_validate(data)
        except (json.JSONDecodeError, ValueError):
            return None


def _extract_json_block(text: str) -> str | None:
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
    # Fallback: a bare {...} object (greedy to the last brace).
    match = re.search(r"\{.*\}", text, re.DOTALL)
    return match.group(0) if match else None
