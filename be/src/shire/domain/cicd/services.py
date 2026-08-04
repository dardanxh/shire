"""CI/CD service: instant detection, the engine scan, and implement-with-AI dispatch.

Implement runs write in a disposable worktree on a dedicated `cicd/*` branch cut from the
repository's active branch. The run only ever produces a LOCAL branch + commit — no push, no PR —
so it behaves identically for local and provider repositories.
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from shire.core.exceptions import ConflictError, NotFoundError
from shire.core.settings import get_settings
from shire.domain.cicd.jobs import build_apply_prompt, build_scan_prompt, parse_suggestions
from shire.domain.cicd.models import CicdExecutionRow
from shire.domain.cicd.repositories import SqlCicdRepository
from shire.domain.cicd.schemas import (
    ApplyCicdSuggestions,
    CicdAnalysisResult,
    CicdEnvironment,
    CicdExecutionResult,
    CicdHobitRun,
    CicdPipelineFile,
    CicdStatusResult,
    CicdSuggestionResult,
)
from shire.domain.jobs import kinds as job_kinds
from shire.domain.jobs.models import JobRow
from shire.domain.jobs.repositories import SqlJobRepository
from shire.domain.jobs.services import JobService
from shire.domain.repository.repositories import SqlRepositoryRepository
from shire.integrations.claude_agent import claude_available
from shire.integrations.git_branches import inspect_named_branches
from shire.integrations.git_worktree import add_worktree
from shire.integrations.scanners.code import cicd_inventory

logger = logging.getLogger(__name__)

CICD_HOBIT_SLUG = "ci-cd"
# The prompt gets the pipeline files as a hint list; a pathological repo shouldn't blow it up.
_FILE_LIMIT = 80
# Environment cards (and the flow diagram) read top-down from production.
_ENV_KIND_ORDER = ("prod", "staging", "qa", "dev", "preview", "other")


def _is_ref_name(branch: str) -> bool:
    """Whether an environment's `branch` is one concrete ref we can look up.

    An environment fed by a pattern rather than a branch ("any branch (push)", "release/*") is a
    real answer, but there is no tip to measure — enriching it would report the branch as gone.
    """
    return bool(branch) and not any(ch in branch for ch in " \t*?[(")


def worktree_path_for(repository_id: uuid.UUID, branch: str) -> Path:
    """`<worktree_root>/<repo_id>/<branch-leaf>` — one disposable checkout per run, the same
    layout the readiness and roadmap execution runs use."""
    leaf = branch.rsplit("/", 1)[-1]
    return (get_settings().worktree_root / str(repository_id) / leaf).resolve()


class CicdService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._cicd = SqlCicdRepository(session)
        # Cross-domain read (clone path + slug) — the analysis is tied to a clone.
        self._repos = SqlRepositoryRepository(session)

    # --- status (instant, no AI) ----------------------------------------------
    def status(self, repository_id: uuid.UUID) -> CicdStatusResult:
        repo = self._repos.get(repository_id)
        if repo is None:
            raise NotFoundError(f"Repository not found: {repository_id}")
        root = Path(repo.analysis_path) if repo.analysis_path else None
        cloned = bool(root and root.is_dir())
        found = cicd_inventory(root) if cloned else []

        scan_job = SqlJobRepository(self._session).latest_unsettled(
            job_kinds.CICD_SCAN, repository_id
        )
        row = self._cicd.get_analysis(repository_id)
        analysis = None
        if row is not None:
            analysis = CicdAnalysisResult.model_validate(row)
            analysis.environments = self._enrich(repo, analysis.environments)

        hobit_run, hobit_pending = self._latest_hobit_run(repository_id)
        return CicdStatusResult(
            repository_id=repository_id,
            cloned=cloned,
            detected_files=[
                CicdPipelineFile(path=path, system=system) for path, system in found[:_FILE_LIMIT]
            ],
            platforms=sorted({system for _path, system in found}),
            analysis=analysis,
            suggestions=[
                CicdSuggestionResult.model_validate(s)
                for s in self._cicd.list_suggestions(repository_id)
            ],
            executions=[
                CicdExecutionResult.model_validate(e)
                for e in self._cicd.list_executions(repository_id)
            ],
            scan_pending=scan_job is not None,
            scan_job_id=scan_job.id if scan_job else None,
            hobit_pending=hobit_pending,
            hobit_run=hobit_run,
            agent_available=claude_available(),
        )

    def _enrich(self, repo, environments: list[CicdEnvironment]) -> list[CicdEnvironment]:
        """Fill each environment's live git facts from the clone, and order prod-first.

        The engine only ever reports what the pipeline config says; "is qa 41 days stale?" is a
        git question, so it is answered here on every read instead of being frozen into the scan.
        """
        branches = [env.branch for env in environments if _is_ref_name(env.branch)]
        tips = {}
        if branches and repo.clone_path and Path(repo.clone_path).is_dir():
            try:
                tips = inspect_named_branches(
                    Path(repo.clone_path), repo.default_branch, branches
                )
            except Exception:  # a broken/absent clone must not break the tab
                logger.warning("Branch enrichment failed for repository %s", repo.id)
        for env in environments:
            if not _is_ref_name(env.branch):
                continue
            tip = tips.get(env.branch)
            env.branch_exists = tip is not None
            if tip is not None:
                env.last_commit_at = tip.last_commit_at
                env.last_commit_author = tip.author_name
                env.ahead = tip.ahead
                env.behind = tip.behind
        return sorted(
            environments,
            key=lambda env: (
                _ENV_KIND_ORDER.index(env.kind) if env.kind in _ENV_KIND_ORDER else 99,
                env.name,
            ),
        )

    def _latest_hobit_run(
        self, repository_id: uuid.UUID
    ) -> tuple[CicdHobitRun | None, bool]:
        """The newest `ci-cd` hobit run plus whether one is in flight."""
        # Deferred import: hobits' completion handler calls back into this service.
        from shire.domain.hobits.services import HobitService

        runs = [
            run
            for run in HobitService(self._session).list_runs(repository_id)
            if run.hobit_slug == CICD_HOBIT_SLUG
        ]
        if not runs:
            return None, False
        pending = any(run.status == "queued" for run in runs)
        latest = runs[0]
        return (
            CicdHobitRun(
                id=latest.id,
                status=latest.status,
                headline=latest.headline,
                tier=latest.tier,
                finished_at=latest.finished_at,
            ),
            pending,
        )

    # --- scan (AI, read-only) -------------------------------------------------
    def enqueue_scan(self, repository_id: uuid.UUID) -> CicdStatusResult:
        """Have the engine read the pipeline config and map the delivery flow.

        Non-blocking: the completion handler replaces the analysis and the scan's proposals, and
        the client polls `status()` while `scan_pending` is true.
        """
        repo = self._require_cloned_repo(repository_id)
        if SqlJobRepository(self._session).latest_unsettled(job_kinds.CICD_SCAN, repository_id):
            raise ConflictError("A CI/CD scan is already running for this repository.")
        root = Path(repo.analysis_path) if repo.analysis_path else None
        found = cicd_inventory(root) if root and root.is_dir() else []
        jobs = JobService(self._session)
        model, timeout_seconds = jobs.engine_defaults()
        jobs.enqueue(
            kind=job_kinds.CICD_SCAN,
            title=f"CI/CD scan — {repo.coordinates.slug}",
            prompt=build_scan_prompt(repo.coordinates.slug, found[:_FILE_LIMIT]),
            payload={
                "cwd": repo.analysis_path,
                "model": model,
                "timeout_seconds": timeout_seconds,
                "repository_id": str(repository_id),
                "branch": repo.current_branch or repo.default_branch,
                "commit_sha": repo.last_analyzed_commit or "",
            },
            repository_id=repository_id,
        )
        return self.status(repository_id)

    def apply_scan(self, repository_id: uuid.UUID, job: JobRow, parsed: dict) -> None:
        """Completion seam: replace the map and the scan's proposed suggestions."""
        self._cicd.replace_analysis(
            repository_id,
            platforms=parsed["platforms"],
            config_files=[p.file for p in parsed["pipelines"]],
            summary=parsed["summary"],
            environments=[env.model_dump(mode="json") for env in parsed["environments"]],
            transitions=[t.model_dump(mode="json") for t in parsed["transitions"]],
            pipelines=[p.model_dump(mode="json") for p in parsed["pipelines"]],
            branch=job.payload.get("branch") or "",
            commit_sha=job.payload.get("commit_sha") or "",
            job_id=job.id,
        )
        self._cicd.clear_proposed(repository_id, "scan")
        self._cicd.add_suggestions(repository_id, "scan", parsed["suggestions"])

    def ingest_hobit_suggestions(self, repository_id: uuid.UUID, raw_output: str) -> int:
        """Harvest the optional `suggestions` array out of a `ci-cd` hobit run.

        The hobit's own output contract (headline/narrative/self-score) is unchanged — Pydantic
        ignores the extra key — so a run that returns only a narrative is still a good run and
        this simply finds nothing.
        """
        items = parse_suggestions(raw_output)
        if not items:
            return 0
        self._cicd.clear_proposed(repository_id, "hobit")
        return self._cicd.add_suggestions(repository_id, "hobit", items)

    # --- implement with AI (writes in a worktree) -----------------------------
    def apply(
        self, repository_id: uuid.UUID, body: ApplyCicdSuggestions
    ) -> CicdExecutionResult:
        repo = self._require_cloned_repo(repository_id)
        if self._cicd.pending_execution(repository_id) is not None:
            raise ConflictError("A CI/CD implement run is already in flight for this repository.")

        rows = self._cicd.proposed_by_ids(repository_id, body.suggestion_ids)
        missing = set(body.suggestion_ids) - {row.id for row in rows}
        if missing:
            raise NotFoundError(
                f"Suggestion not found (or already applied): "
                f"{', '.join(str(m) for m in missing)}"
            )

        branch = f"cicd/{repo.coordinates.name[:40]}-{uuid.uuid4().hex[:8]}"
        worktree = worktree_path_for(repository_id, branch)
        base_branch = repo.current_branch or repo.default_branch
        try:
            base_sha = add_worktree(Path(repo.clone_path), worktree, branch, base_branch)
        except Exception as exc:
            raise ConflictError(f"Could not create the execution worktree: {exc}") from exc

        execution = self._cicd.add_execution(
            CicdExecutionRow(
                repository_id=repository_id,
                status="pending",
                branch=branch,
                worktree_path=str(worktree),
                base_sha=base_sha,
                suggestion_ids=[str(row.id) for row in rows],
            )
        )

        jobs = JobService(self._session)
        model, timeout_seconds = jobs.engine_defaults()
        job = jobs.enqueue(
            kind=job_kinds.CICD_APPLY,
            title=f"Implement CI/CD suggestions — {repo.coordinates.slug}",
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
        return CicdExecutionResult.model_validate(execution)

    def _require_cloned_repo(self, repository_id: uuid.UUID):
        repo = self._repos.get(repository_id)
        if repo is None:
            raise NotFoundError(f"Repository not found: {repository_id}")
        if not repo.clone_path:
            raise ConflictError("Repository has not been cloned.")
        return repo
