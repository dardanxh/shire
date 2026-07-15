"""The principle-audit prompt + the completion handler that settles check rows.

The engine explores the clone read-only and returns a structured verdict; the handler parses
it and stamps the check. A stale audit (repo switched branches since enqueue) is dropped so
it can't record a verdict about code that is no longer checked out.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime

from hobits.core.db import unit_of_work
from hobits.domain.jobs.models import JobRow
from hobits.domain.principles.models import PrincipleCheckRow, PrincipleRow
from hobits.domain.repository.models import RepositoryRow

logger = logging.getLogger(__name__)

_MAX_VIOLATIONS = 20

_AUDIT_PROMPT = """\
You are auditing the repository **{slug}** against one engineering principle its team has \
committed to. Explore the actual code with your Read, Grep and Glob tools — be thorough enough \
to trust your verdict, and never cite a file you did not open.

## The principle
**{name}** (severity: {severity})

{statement}

## Your job
Decide whether this repository UPHOLDS or VIOLATES the principle right now. Be strict but \
fair: judge the code as it is, not hypotheticals; if the principle simply does not apply to \
this repository (e.g. it concerns endpoints and there are none), it is upheld — say so in the \
summary. List at most {max_violations} violations, most important first.

Return ONLY a single fenced json object as the very last thing, nothing else:
```json
{{
  "verdict": "upheld" or "violated",
  "summary": "2-3 sentences: your overall finding and how you verified it",
  "violations": [
    {{"file": "path/to/file.py", "line": 42, "explanation": "what breaks the principle here"}}
  ]
}}
```
`violations` must be empty when the verdict is "upheld". `line` may be null."""


def build_audit_prompt(slug: str, principle: PrincipleRow) -> str:
    return _AUDIT_PROMPT.format(
        slug=slug,
        name=principle.name,
        severity=principle.severity,
        statement=principle.statement,
        max_violations=_MAX_VIOLATIONS,
    )


def handle_principle_audit(job: JobRow) -> None:
    check_id = uuid.UUID(job.payload["check_id"])
    with unit_of_work() as session:
        check = session.get(PrincipleCheckRow, check_id)
        if check is None or check.status != "pending":
            return  # check deleted, or already settled by an earlier dispatch

        check.finished_at = datetime.now(UTC)
        check.duration_seconds = job.duration_seconds

        # Staleness guard: the verdict must describe the branch that was audited.
        repo = session.get(RepositoryRow, check.repository_id)
        expected = job.payload.get("branch")
        if repo is None or (
            expected is not None
            and (repo.current_branch or repo.default_branch) != expected
        ):
            check.status = "error"
            check.error = "The repository's active branch changed while the audit ran."
            return

        if job.status != "succeeded":
            check.status = "error"
            check.error = job.error or "The audit job failed."
            return

        parsed = _parse_verdict(job.result or "")
        if parsed is None:
            check.status = "error"
            check.error = "Could not parse the auditor's structured verdict."
            return

        verdict, summary, violations = parsed
        check.status = verdict
        check.summary = summary
        check.violations = violations
        check.error = None


def _parse_verdict(text: str) -> tuple[str, str | None, list[dict]] | None:
    block = _extract_json_object(text)
    if block is None:
        return None
    try:
        data = json.loads(block)
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(data, dict) or data.get("verdict") not in ("upheld", "violated"):
        return None
    raw = data.get("violations")
    violations = []
    if isinstance(raw, list):
        for item in raw[:_MAX_VIOLATIONS]:
            if not isinstance(item, dict) or not item.get("file"):
                continue
            line = item.get("line")
            violations.append(
                {
                    "file": str(item["file"]),
                    "line": int(line) if isinstance(line, int) else None,
                    "explanation": str(item.get("explanation") or ""),
                }
            )
    summary = str(data["summary"]) if data.get("summary") else None
    return str(data["verdict"]), summary, violations


def _extract_json_object(text: str) -> str | None:
    """The final fenced ```json {...}``` object in the agent's output (else a bare {...})."""
    marker = text.rfind("```json")
    if marker != -1:
        after = text.find("\n", marker)
        close = text.find("```", after + 1) if after != -1 else -1
        if after != -1 and close > after:
            return text[after:close].strip() or None
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        return text[start : end + 1]
    return None
