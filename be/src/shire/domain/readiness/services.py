"""Readiness service: instant clone scan, AI suggestion runs, and make-ai-ready dispatch.

Make-ai-ready runs write in a disposable worktree on a dedicated `ai-ready/*` branch cut
from the repository's active branch. The run only ever produces a LOCAL branch + commit —
no push, no PR — so it behaves identically for local and provider repositories.
"""

from __future__ import annotations

import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from shire.core.exceptions import ConflictError, NotFoundError
from shire.core.settings import get_settings
from shire.domain.jobs import kinds as job_kinds
from shire.domain.jobs.schemas import JobResult
from shire.domain.jobs.services import JobService
from shire.domain.readiness import catalog
from shire.domain.readiness.jobs import (
    build_apply_prompt,
    build_suggest_prompt,
    detected_assistants,
)
from shire.domain.readiness.models import ReadinessExecutionRow, ReadinessSuggestionRow
from shire.domain.readiness.schemas import (
    ApplySuggestions,
    AssistantState,
    ReadinessExecutionResult,
    ReadinessOverviewItem,
    ReadinessStatusResult,
    ReadinessSuggestionResult,
)
from shire.domain.repository.repositories import SqlRepositoryRepository
from shire.integrations.claude_agent import claude_available
from shire.integrations.git_worktree import add_worktree


def worktree_path_for(repository_id: uuid.UUID, branch: str) -> Path:
    """`<worktree_root>/<repo_id>/<branch-leaf>` — one disposable checkout per run."""
    leaf = branch.rsplit("/", 1)[-1]
    return (get_settings().worktree_root / str(repository_id) / leaf).resolve()


class ReadinessService:
    def __init__(self, session: Session) -> None:
        self._session = session
        # Cross-domain read (clone path + slug) — readiness is tightly coupled to a clone.
        self._repos = SqlRepositoryRepository(session)

    # --- status (instant, no job) ---------------------------------------------
    def status(self, repository_id: uuid.UUID) -> ReadinessStatusResult:
        repo = self._repos.get(repository_id)
        if repo is None:
            raise NotFoundError(f"Repository not found: {repository_id}")
        assistants: list[AssistantState] = []
        scanned = bool(repo.clone_path and Path(repo.clone_path).is_dir())
        if scanned:
            assistants = [
                AssistantState(**state) for state in catalog.scan_repo(repo.clone_path)
            ]
        suggestions = self._session.scalars(
            select(ReadinessSuggestionRow)
            .where(ReadinessSuggestionRow.repository_id == repository_id)
            .order_by(ReadinessSuggestionRow.created_at.desc())
        )
        executions = self._session.scalars(
            select(ReadinessExecutionRow)
            .where(ReadinessExecutionRow.repository_id == repository_id)
            .order_by(ReadinessExecutionRow.created_at.desc())
        )
        return ReadinessStatusResult(
            repository_id=repository_id,
            scanned=scanned,
            assistants=assistants,
            suggestions=[
                ReadinessSuggestionResult.model_validate(row) for row in suggestions
            ],
            executions=[
                ReadinessExecutionResult.model_validate(row) for row in executions
            ],
            agent_available=claude_available(),
        )

    # --- suggestions (AI, read-only) ------------------------------------------
    def enqueue_suggest(self, repository_id: uuid.UUID) -> JobResult:
        repo = self._require_cloned_repo(repository_id)
        scan = catalog.scan_repo(repo.analysis_path)
        jobs = JobService(self._session)
        model, timeout_seconds = jobs.engine_defaults()
        job = jobs.enqueue(
            kind=job_kinds.READINESS_SUGGEST,
            title=f"AI readiness suggestions — {repo.coordinates.slug}",
            prompt=build_suggest_prompt(repo.coordinates.slug, scan),
            payload={
                "cwd": repo.analysis_path,
                "model": model,
                "timeout_seconds": timeout_seconds,
                "repository_id": str(repository_id),
                # Adopted assistants only (empty = none adopted, all allowed) — the
                # handler drops suggestions outside this set as a hard guarantee.
                "allowed_assistants": detected_assistants(scan),
            },
            repository_id=repository_id,
        )
        return JobResult.of(job)

    # --- make-ai-ready (AI, writes in a worktree) -----------------------------
    def apply(
        self, repository_id: uuid.UUID, body: ApplySuggestions
    ) -> ReadinessExecutionResult:
        repo = self._require_cloned_repo(repository_id)
        pending = self._session.scalar(
            select(ReadinessExecutionRow).where(
                ReadinessExecutionRow.repository_id == repository_id,
                ReadinessExecutionRow.status == "pending",
            )
        )
        if pending is not None:
            raise ConflictError("A make-ai-ready run is already in flight for this repository.")

        rows = list(
            self._session.scalars(
                select(ReadinessSuggestionRow).where(
                    ReadinessSuggestionRow.id.in_(body.suggestion_ids),
                    ReadinessSuggestionRow.repository_id == repository_id,
                    ReadinessSuggestionRow.status == "proposed",
                )
            )
        )
        missing = set(body.suggestion_ids) - {row.id for row in rows}
        if missing:
            raise NotFoundError(
                f"Suggestion not found (or already applied): {', '.join(str(m) for m in missing)}"
            )

        branch = f"ai-ready/{repo.coordinates.name[:40]}-{uuid.uuid4().hex[:8]}"
        worktree = worktree_path_for(repository_id, branch)
        base_branch = repo.current_branch or repo.default_branch
        try:
            base_sha = add_worktree(Path(repo.clone_path), worktree, branch, base_branch)
        except Exception as exc:
            raise ConflictError(f"Could not create the execution worktree: {exc}") from exc

        execution = ReadinessExecutionRow(
            repository_id=repository_id,
            status="pending",
            branch=branch,
            worktree_path=str(worktree),
            base_sha=base_sha,
            suggestion_ids=[str(row.id) for row in rows],
        )
        self._session.add(execution)
        self._session.flush()

        jobs = JobService(self._session)
        model, timeout_seconds = jobs.engine_defaults()
        job = jobs.enqueue(
            kind=job_kinds.READINESS_APPLY,
            title=f"Make AI-ready — {repo.coordinates.slug}",
            prompt=build_apply_prompt(repo.coordinates.slug, rows),
            payload={
                "cwd": str(worktree),
                "model": model,
                "timeout_seconds": timeout_seconds,
                "allowed_tools": ["Read", "Grep", "Glob", "Edit", "Write"],
                "repository_id": str(repository_id),
                "execution_id": str(execution.id),
                "branch": branch,
            },
            repository_id=repository_id,
        )
        execution.job_id = job.id
        self._session.flush()
        return ReadinessExecutionResult.model_validate(execution)

    # --- cross-repo overview ---------------------------------------------------
    def overview(self) -> list[ReadinessOverviewItem]:
        items: list[ReadinessOverviewItem] = []
        proposed_counts: dict[uuid.UUID, int] = {}
        for row in self._session.scalars(
            select(ReadinessSuggestionRow).where(ReadinessSuggestionRow.status == "proposed")
        ):
            proposed_counts[row.repository_id] = proposed_counts.get(row.repository_id, 0) + 1
        for repo in self._repos.list():
            if not repo.clone_path or not Path(repo.clone_path).is_dir():
                continue
            states = catalog.scan_repo(repo.clone_path)
            present = sum(
                1 for s in states for a in s["artifacts"] if a["present"]
            )
            expected = sum(len(s["artifacts"]) for s in states)
            items.append(
                ReadinessOverviewItem(
                    repository_id=repo.id,
                    slug=repo.coordinates.slug,
                    detected=[s["key"] for s in states if s["detected"]],
                    present_count=present,
                    expected_count=expected,
                    proposed_count=proposed_counts.get(repo.id, 0),
                )
            )
        return items

    def _require_cloned_repo(self, repository_id: uuid.UUID):
        repo = self._repos.get(repository_id)
        if repo is None or not repo.clone_path:
            raise NotFoundError(f"Repository not cloned: {repository_id}")
        return repo
