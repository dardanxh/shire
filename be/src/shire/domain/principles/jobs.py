"""The principle-audit prompts + the completion handlers that settle check rows.

The engine explores the clone read-only and returns a structured verdict; the handler parses
it and stamps the check. A stale audit (repo switched branches since enqueue) is dropped so
it can't record a verdict about code that is no longer checked out.

Two shapes exist for token efficiency: the single audit (one session, one principle) and the
batched audit (one session judges up to BATCH_SIZE principles — the repo is explored once
instead of once per principle, which is where nearly all of a sweep's tokens went).
"""

from __future__ import annotations

import json
import logging
import uuid
from collections.abc import Iterable, Sequence
from datetime import UTC, datetime

from shire.core.db import unit_of_work
from shire.domain.jobs.models import JobRow
from shire.domain.principles.models import PrincipleCheckRow, PrincipleRow
from shire.domain.repository.models import RepositoryRow

logger = logging.getLogger(__name__)

MAX_VIOLATIONS = 20
# Batched sessions: enough principles to amortize the exploration, few enough that each still
# gets real attention and the single completion stays within output limits.
BATCH_SIZE = 8
BATCH_MAX_VIOLATIONS = 10

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


_AUDIT_BATCH_PROMPT = """\
You are auditing the repository **{slug}** against {count} engineering principles its team \
has committed to. Explore the actual code with your Read, Grep and Glob tools — be thorough \
enough to trust every verdict, and never cite a file you did not open. Explore the repository \
once, then judge each principle against what you found; dig deeper only where a specific \
principle demands it.

{principles_section}

## Your job
For EACH principle above, decide whether this repository UPHOLDS or VIOLATES it right now. Be \
strict but fair: judge the code as it is, not hypotheticals; if a principle simply does not \
apply to this repository (e.g. it concerns endpoints and there are none), it is upheld — say \
so in that principle's summary. List at most {max_violations} violations per principle, most \
important first.

Return ONLY a single fenced json object as the very last thing, nothing else, with exactly one \
entry per principle (use the numbers above):
```json
{{
  "results": [
    {{
      "index": 1,
      "verdict": "upheld" or "violated",
      "summary": "2-3 sentences: your finding for this principle and how you verified it",
      "violations": [
        {{"file": "path/to/file.py", "line": 42, "explanation": "what breaks the principle here"}}
      ]
    }}
  ]
}}
```
Every principle must appear exactly once. `violations` must be empty when that principle's \
verdict is "upheld". `line` may be null."""


def build_audit_prompt(slug: str, principle: PrincipleRow) -> str:
    return _AUDIT_PROMPT.format(
        slug=slug,
        name=principle.name,
        severity=principle.severity,
        statement=principle.statement,
        max_violations=MAX_VIOLATIONS,
    )


def format_principles_section(principles: Sequence[PrincipleRow]) -> str:
    """The numbered '## The principles' block shared by the repo-wide and MR-scoped batch
    prompts. The 1-based index is the parser's join key back to the check rows."""
    parts = ["## The principles"]
    for i, principle in enumerate(principles, start=1):
        parts.append(
            f"### Principle {i}: {principle.name} (severity: {principle.severity})\n"
            f"{principle.statement}"
        )
    return "\n\n".join(parts)


def build_audit_batch_prompt(slug: str, principles: Sequence[PrincipleRow]) -> str:
    return _AUDIT_BATCH_PROMPT.format(
        slug=slug,
        count=len(principles),
        principles_section=format_principles_section(principles),
        max_violations=BATCH_MAX_VIOLATIONS,
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

        parsed = parse_verdict(job.result or "")
        if parsed is None:
            check.status = "error"
            check.error = "Could not parse the auditor's structured verdict."
            return

        verdict, summary, violations = parsed
        check.status = verdict
        check.summary = summary
        check.violations = violations
        check.error = None


def handle_principle_audit_batch(job: JobRow) -> None:
    """Settle every check row of one batched audit session.

    The guards run once for the whole batch (one repo, one branch, one job outcome); only
    the verdict distribution is per check. A check the auditor skipped settles as its own
    error instead of poisoning its siblings.
    """
    entries = job.payload.get("checks") or []  # [{check_id, principle_id, index}]
    with unit_of_work() as session:
        checks: list[tuple[dict, PrincipleCheckRow]] = []
        for entry in entries:
            check = session.get(PrincipleCheckRow, uuid.UUID(entry["check_id"]))
            if check is None or check.status != "pending":
                continue  # deleted, or settled by an earlier dispatch
            check.finished_at = datetime.now(UTC)
            check.duration_seconds = job.duration_seconds
            checks.append((entry, check))
        if not checks:
            return

        def fail_all(message: str) -> None:
            for _, check in checks:
                check.status = "error"
                check.error = message

        # Staleness guard: one repo, one comparison for the whole batch.
        repo = session.get(RepositoryRow, checks[0][1].repository_id)
        expected = job.payload.get("branch")
        if repo is None or (
            expected is not None
            and (repo.current_branch or repo.default_branch) != expected
        ):
            fail_all("The repository's active branch changed while the audit ran.")
            return

        if job.status != "succeeded":
            fail_all(job.error or "The audit job failed.")
            return

        parsed = parse_batch_verdicts(
            job.result or "", (entry["index"] for entry, _ in checks)
        )
        if parsed is None:
            fail_all("Could not parse the auditor's structured verdicts.")
            return

        for entry, check in checks:
            result = parsed.get(entry["index"])
            if result is None:
                check.status = "error"
                check.error = "The auditor skipped this principle."
                continue
            verdict, summary, violations = result
            check.status = verdict
            check.summary = summary
            check.violations = violations
            check.error = None


def parse_verdict(text: str) -> tuple[str, str | None, list[dict]] | None:
    """Parse an auditor's `{verdict, summary, violations}` block. Shared with the MR-scoped
    principle check, which asks the same question of a diff and gets the same shape back."""
    block = _extract_json_object(text)
    if block is None:
        return None
    try:
        data = json.loads(block)
    except (json.JSONDecodeError, ValueError):
        return None
    return _normalize_verdict(data, MAX_VIOLATIONS)


def parse_batch_verdicts(
    text: str, expected_indexes: Iterable[int]
) -> dict[int, tuple[str, str | None, list[dict]]] | None:
    """Parse a batched auditor's `{"results": [{index, verdict, summary, violations}]}`.

    Returns None only when no parseable results object exists at all (the whole batch settles
    as one parse error). Otherwise a map keyed by index; entries the auditor skipped or
    mangled are simply absent — the handler settles those checks individually. Unknown and
    duplicate indexes are ignored (first entry wins).
    """
    block = _extract_json_object(text)
    if block is None:
        return None
    try:
        data = json.loads(block)
    except (json.JSONDecodeError, ValueError):
        return None
    results = data.get("results") if isinstance(data, dict) else None
    if not isinstance(results, list):
        return None
    expected = set(expected_indexes)
    parsed: dict[int, tuple[str, str | None, list[dict]]] = {}
    for entry in results:
        if not isinstance(entry, dict):
            continue
        index = entry.get("index")
        if not isinstance(index, int) or index not in expected or index in parsed:
            continue
        normalized = _normalize_verdict(entry, BATCH_MAX_VIOLATIONS)
        if normalized is None:
            continue
        parsed[index] = normalized
    return parsed


def _normalize_verdict(
    data: dict, max_violations: int
) -> tuple[str, str | None, list[dict]] | None:
    """One verdict entry → (verdict, summary, violations) — the shape both parsers settle."""
    if not isinstance(data, dict) or data.get("verdict") not in ("upheld", "violated"):
        return None
    raw = data.get("violations")
    violations = []
    if isinstance(raw, list):
        for item in raw[:max_violations]:
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
