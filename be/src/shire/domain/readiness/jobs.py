"""Prompt builders + completion handlers for AI-readiness jobs.

The suggest job is read-only analysis of the clone. The apply job writes inside a
disposable worktree; the handler commits and then KEEPS the `ai-ready/*` branch while
removing the worktree — the branch is the deliverable (no push, no PR).
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime
from pathlib import Path

from shire.core.db import unit_of_work
from shire.domain.jobs.models import JobRow
from shire.domain.readiness.catalog import ASSISTANT_KEYS
from shire.domain.readiness.models import ReadinessExecutionRow, ReadinessSuggestionRow
from shire.domain.repository.models import RepositoryRow
from shire.integrations.git_worktree import commit_all, remove_worktree

logger = logging.getLogger(__name__)

_SUGGEST_PROMPT = """\
You are assessing how AI-READY the repository **{repo}** is: how well it is configured for \
AI coding assistants (Claude Code, OpenAI Codex, Cursor, GitHub Copilot, Windsurf, Gemini \
CLI, Aider, Cline). Explore the real code with your Read, Grep and Glob tools: the project \
structure, build/test commands, conventions, and any existing assistant configs.

The deterministic scan already found this (present/missing per assistant):
{scan}

{focus}

Propose concrete, high-value suggestions to ADD or EDIT assistant configuration:
- Each suggestion targets ONE file or directory and must say what content belongs in it, \
grounded in what this repository actually is (its stack, commands, layout, conventions).
- Suggest EDITs for existing artifacts that are thin, stale, or missing key sections.
- 4-10 suggestions total, most valuable first. Do not suggest artifacts that make no sense \
for this repo.

Allowed assistant keys: {allowed_keys}.

Return ONLY a single fenced json object as the very last thing, nothing else:
```json
{{
  "suggestions": [
    {{
      "assistant": "claude",
      "action": "add",
      "path": "CLAUDE.md",
      "title": "Add a CLAUDE.md with build/test commands and conventions",
      "detail": "2-4 sentences: exactly what content to include and why, specific to this repo"
    }}
  ]
}}
```"""

_APPLY_PROMPT = """\
You are making the repository **{repo}** AI-ready by implementing the accepted suggestions \
below. You are working in a disposable git worktree on a dedicated branch — the platform \
commits for you afterwards.

Implement each suggestion exactly — create or edit ONLY the listed files/directories:
{suggestions}

Hard rules:
- Ground every instruction file in the real repository: read the code first, document the \
actual stack, commands, layout and conventions — no generic boilerplate.
- Keep each file focused and concise; follow the target tool's expected format.
- You cannot run commands — verify your work by reading what you wrote.
- Do NOT create commits or touch anything under .git.

Return ONLY a single fenced json object as the very last thing, nothing else:
```json
{{
  "summary": "2-4 sentences: what was added/edited and how it makes the repo AI-ready",
  "changed_files": ["CLAUDE.md", ".cursor/rules/core.mdc"]
}}
```"""


def detected_assistants(scan: list[dict]) -> list[str]:
    return [state["key"] for state in scan if state["detected"]]


def build_suggest_prompt(repo_slug: str, scan: list[dict]) -> str:
    lines = []
    for state in scan:
        present = [a["path"] for a in state["artifacts"] if a["present"]]
        missing = [a["path"] for a in state["artifacts"] if not a["present"]]
        lines.append(
            f"- {state['key']}: present={present or 'none'}, missing={missing or 'none'}"
        )
    # A repo that already picked its assistant(s) gets focused advice for those tools only;
    # the broad starter-set is reserved for repos with no assistant configs at all.
    detected = detected_assistants(scan)
    if detected:
        names = ", ".join(detected)
        focus = (
            f"This repository already uses: {names}. Suggest improvements ONLY for these "
            "assistants — deepen and fix what is already adopted (missing companion "
            "artifacts, thin or stale instructions). Do NOT propose configs for any other "
            "tool; the team has not adopted them."
        )
        allowed = names
    else:
        focus = (
            "This repository has no assistant configs yet. Propose a solid starter set: "
            "repo instruction files first (CLAUDE.md / AGENTS.md), then rules for other "
            "assistants where they genuinely add value."
        )
        allowed = ", ".join(sorted(ASSISTANT_KEYS))
    return _SUGGEST_PROMPT.format(
        repo=repo_slug, scan="\n".join(lines), focus=focus, allowed_keys=allowed
    )


def build_apply_prompt(repo_slug: str, rows: list[ReadinessSuggestionRow]) -> str:
    listing = "\n".join(
        f"- [{row.assistant}] {row.action.upper()} `{row.path}`: {row.title}\n  {row.detail}"
        for row in rows
    )
    return _APPLY_PROMPT.format(repo=repo_slug, suggestions=listing)


def handle_readiness_suggest(job: JobRow) -> None:
    if job.status != "succeeded":
        return  # the job row already carries the error
    suggestions = _parse_suggestions(job.result or "")
    if suggestions is None:
        _fail_job(job.id, "The agent did not return a usable suggestion list.")
        return
    # Hard guarantee: a repo with adopted assistants only gets suggestions for those,
    # even if the agent strays outside the prompt's allowed set.
    allowed = set(job.payload.get("allowed_assistants") or [])
    if allowed:
        suggestions = [s for s in suggestions if s["assistant"] in allowed]
        if not suggestions:
            _fail_job(job.id, "The agent only suggested tools this repository does not use.")
            return
    repository_id = uuid.UUID(job.payload["repository_id"])
    with unit_of_work() as session:
        # Fresh run replaces the previous proposals; applied rows stay as history.
        for row in session.scalars(
            _select_suggestions(repository_id, status="proposed")
        ):
            session.delete(row)
        for item in suggestions:
            session.add(ReadinessSuggestionRow(repository_id=repository_id, **item))


def handle_readiness_apply(job: JobRow) -> None:
    execution_id = uuid.UUID(job.payload["execution_id"])
    with unit_of_work() as session:
        execution = session.get(ReadinessExecutionRow, execution_id)
        if execution is None or execution.status != "pending":
            return
        repo = session.get(RepositoryRow, uuid.UUID(job.payload["repository_id"]))
        clone = Path(repo.clone_path) if repo and repo.clone_path else None
        worktree = Path(execution.worktree_path) if execution.worktree_path else None
        execution.finished_at = datetime.now(UTC)

        def _cleanup(keep_branch: bool) -> None:
            if clone is None or worktree is None:
                return
            branch = None if keep_branch else execution.branch
            try:
                remove_worktree(clone, worktree, branch)
            except Exception:
                logger.warning("Worktree cleanup failed for execution %s", execution.id)
            execution.worktree_path = None

        if job.status != "succeeded":
            execution.status = "failed"
            execution.error = job.error or "The engine job did not succeed."
            _cleanup(keep_branch=False)
            return
        if worktree is None or not worktree.is_dir():
            execution.status = "failed"
            execution.error = "The execution worktree is gone."
            _cleanup(keep_branch=False)
            return

        commit_sha = commit_all(worktree, "Make AI-ready: assistant configuration")
        if commit_sha is None:
            execution.status = "failed"
            execution.error = "The agent finished without changing any files."
            _cleanup(keep_branch=False)
            return

        parsed = _parse_apply(job.result or "")
        execution.status = "succeeded"
        execution.commit_sha = commit_sha
        execution.agent_summary = parsed.get("summary", "") if parsed else ""
        for raw_id in execution.suggestion_ids:
            row = session.get(ReadinessSuggestionRow, uuid.UUID(raw_id))
            if row is not None:
                row.status = "applied"
                row.execution_id = execution.id
        # The branch IS the deliverable — remove the worktree, keep the branch.
        _cleanup(keep_branch=True)


def _select_suggestions(repository_id: uuid.UUID, status: str):
    from sqlalchemy import select

    return select(ReadinessSuggestionRow).where(
        ReadinessSuggestionRow.repository_id == repository_id,
        ReadinessSuggestionRow.status == status,
    )


def _parse_suggestions(text: str) -> list[dict] | None:
    from shire.domain.substrate.services import _extract_json_object

    block = _extract_json_object(text)
    if block is None:
        return None
    try:
        data = json.loads(block)
    except (json.JSONDecodeError, ValueError):
        return None
    raw_items = data.get("suggestions") if isinstance(data, dict) else None
    if not isinstance(raw_items, list):
        return None
    items: list[dict] = []
    for raw in raw_items:
        if not isinstance(raw, dict):
            continue
        assistant = str(raw.get("assistant") or "")
        action = str(raw.get("action") or "")
        if assistant not in ASSISTANT_KEYS or action not in ("add", "edit"):
            continue
        if not raw.get("path") or not raw.get("title"):
            continue
        items.append(
            {
                "assistant": assistant,
                "action": action,
                "path": str(raw["path"])[:300],
                "title": str(raw["title"])[:200],
                "detail": str(raw.get("detail") or ""),
            }
        )
    return items or None


def _parse_apply(text: str) -> dict | None:
    from shire.domain.substrate.services import _extract_json_object

    block = _extract_json_object(text)
    if block is None:
        return None
    try:
        data = json.loads(block)
    except (json.JSONDecodeError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def _fail_job(job_id: uuid.UUID, reason: str) -> None:
    """A succeeded engine run with unusable output is, for observability, a failed job."""
    with unit_of_work() as session:
        row = session.get(JobRow, job_id)
        if row is not None:
            row.status = "failed"
            row.error = reason
