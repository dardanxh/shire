"""Roadmap service: CRUD, the multi-repo generation digest, and item curation.

Generation is non-blocking: `create` (and later `regenerate`) inserts a pending version and
enqueues one engine job; the completion handler (jobs.py) materializes the plan. Everything
the UI renders — matrix, timeline, table — is a client-side regrouping of one flat item list,
so the service exposes exactly one detail shape.
"""

from __future__ import annotations

import contextlib
import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from shire.core.exceptions import ConflictError, NotFoundError, ValidationError
from shire.core.pagination import Page, PaginationParams
from shire.domain.briefing.models import BriefingItemRow
from shire.domain.context.models import ContextPackRow
from shire.domain.jobs import kinds as job_kinds
from shire.domain.jobs.services import JobService
from shire.domain.news.models import NewsItemRow
from shire.domain.principles.models import PrincipleCheckRow, PrincipleRow
from shire.domain.repository.models import RepositoryRow
from shire.domain.roadmap.jobs import build_execute_prompt, build_generate_prompt
from shire.domain.roadmap.models import (
    ITEM_EFFORTS,
    ITEM_TRANSITIONS,
    RoadmapExecutionRow,
    RoadmapItemDependencyRow,
    RoadmapItemEventRow,
    RoadmapItemRow,
    RoadmapRow,
    RoadmapVersionRow,
)
from shire.domain.roadmap.repositories import (
    SqlRoadmapConfigRepository,
    SqlRoadmapExecutionRepository,
    SqlRoadmapItemRepository,
    SqlRoadmapRepository,
    SqlRoadmapVersionRepository,
)
from shire.domain.roadmap.schemas import (
    BurnupPoint,
    BurnupResult,
    CreateItemDependency,
    CreateRoadmap,
    ExportedIssueResult,
    ExportIssuesRequest,
    ExportIssuesResult,
    RadarResult,
    RefreshPrsResult,
    RepoAssessmentResult,
    RepoRoadmapSliceResult,
    RoadmapConfigResult,
    RoadmapDetailResult,
    RoadmapDriftCheckResult,
    RoadmapDriftFindingResult,
    RoadmapDriftStatusResult,
    RoadmapExecutionResult,
    RoadmapItemResult,
    RoadmapMilestoneResult,
    RoadmapRepoRef,
    RoadmapResult,
    RoadmapVersionResult,
    UpdateRoadmap,
    UpdateRoadmapConfig,
    UpdateRoadmapItem,
    quadrant_of,
)
from shire.domain.substrate.models import (
    AnalysisRow,
    DependencyRow,
    HotspotRow,
    VulnerabilityRow,
)

# Digest budgets: the whole prompt must stay comfortably inside one context window even for
# double-digit portfolios, so each repo's section shrinks as the selection grows.
_DIGEST_TOTAL_BUDGET = 30_000
_DIGEST_REPO_BUDGET_CAP = 3_500
_DIGEST_REPO_BUDGET_FLOOR = 1_500
_DIGEST_DEPS_PER_REPO = 10
_DIGEST_HOTSPOTS_PER_REPO = 5
_DIGEST_VULN_PACKAGES_PER_REPO = 5
_DIGEST_VIOLATIONS_PER_REPO = 5
_DIGEST_BRIEFING_PER_REPO = 8
_DIGEST_NARRATIVE_CHARS = 300
_DIGEST_NEWS_BUDGET = 1_500
_DIGEST_NEWS_ITEMS = 10

# On regeneration, how many previous-version item titles ride along in the prompt.
_PREVIOUS_ITEMS_LIMIT = 60


class RoadmapService:
    """Constructed per request from a DB session."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._roadmaps = SqlRoadmapRepository(session)
        self._versions = SqlRoadmapVersionRepository(session)
        self._items = SqlRoadmapItemRepository(session)
        self._executions = SqlRoadmapExecutionRepository(session)
        self._config = SqlRoadmapConfigRepository(session)

    # --- roadmap CRUD -----------------------------------------------------------------
    def create(self, data: CreateRoadmap) -> RoadmapDetailResult:
        repos = self._resolve_repositories(data.repository_ids)
        now = datetime.now(UTC)
        roadmap = RoadmapRow(
            name=data.name.strip(),
            goal=(data.goal or "").strip() or None,
            created_at=now,
            updated_at=now,
        )
        self._roadmaps.add(roadmap)
        self._roadmaps.set_repositories(roadmap.id, [r.id for r in repos])
        self._enqueue_generation(roadmap, repos)
        return self.get(roadmap.id)

    def list(self, params: PaginationParams) -> Page[RoadmapResult]:
        rows, total = self._roadmaps.page(offset=params.offset, limit=params.limit)
        ids = [r.id for r in rows]
        repo_ids = self._roadmaps.repository_ids_by_roadmap(ids)
        latest = self._versions.latest_by_roadmap(ids)
        results = []
        for row in rows:
            repos = self._resolve_repositories(repo_ids.get(row.id, []), must_exist=False)
            current = self._versions.get(row.current_version_id) if row.current_version_id else None
            counts = self._items.status_counts(current.id) if current else {}
            newest = latest.get(row.id)
            results.append(
                RoadmapResult.of(
                    row,
                    repositories=repos,
                    version_number=current.number if current else None,
                    generation_status=newest.status if newest else None,
                    items_total=sum(counts.values()),
                    items_done=counts.get("done", 0),
                )
            )
        return Page.create(results, total, params)

    def get(
        self, roadmap_id: uuid.UUID, *, version_number: int | None = None
    ) -> RoadmapDetailResult:
        roadmap = self._require_roadmap(roadmap_id)
        repos = self._resolve_repositories(
            self._roadmaps.repository_ids(roadmap_id), must_exist=False
        )

        if version_number is not None:
            version = self._versions.by_number(roadmap_id, version_number)
            if version is None:
                raise NotFoundError("Roadmap version not found")
        else:
            version = (
                self._versions.get(roadmap.current_version_id)
                if roadmap.current_version_id
                else None
            )

        newest = self._versions.latest(roadmap_id)
        generation = newest if newest is not None and newest.status != "ready" else None

        milestones = items = []
        deps: dict[uuid.UUID, list[uuid.UUID]] = {}
        executions: dict[uuid.UUID, RoadmapExecutionRow] = {}
        assessments: list[dict] = []
        if version is not None and version.status == "ready":
            milestones = self._items.milestones_for_version(version.id)
            items = self._items.list_for_version(version.id)
            deps = self._items.dependencies_for_version(version.id)
            executions = self._executions.latest_per_item(version.id)
            assessments = version.assessments or []

        return RoadmapDetailResult(
            id=roadmap.id,
            name=roadmap.name,
            goal=roadmap.goal,
            status=roadmap.status,
            repositories=[RoadmapRepoRef.of(r) for r in repos],
            version=self._version_result(version) if version else None,
            generation=self._version_result(generation) if generation else None,
            milestones=[RoadmapMilestoneResult.of(m) for m in milestones],
            items=[
                RoadmapItemResult.of(
                    i, depends_on=deps.get(i.id, []), execution=executions.get(i.id)
                )
                for i in items
            ],
            assessments=[RepoAssessmentResult(**a) for a in assessments],
            created_at=roadmap.created_at,
            updated_at=roadmap.updated_at,
        )

    def for_repository(self, repository_id: uuid.UUID) -> list[RepoRoadmapSliceResult]:
        """Every roadmap covering the repository, sliced to that repo's current-version items
        (the repository detail's `roadmaps` tab)."""
        if self._session.get(RepositoryRow, repository_id) is None:
            raise NotFoundError("Repository not found")
        slices = []
        for roadmap in self._roadmaps.list_for_repository(repository_id):
            current = (
                self._versions.get(roadmap.current_version_id)
                if roadmap.current_version_id
                else None
            )
            newest = self._versions.latest(roadmap.id)
            items: list[RoadmapItemResult] = []
            if current is not None:
                deps = self._items.dependencies_for_version(current.id)
                executions = self._executions.latest_per_item(current.id)
                items = [
                    RoadmapItemResult.of(
                        i, depends_on=deps.get(i.id, []), execution=executions.get(i.id)
                    )
                    for i in self._items.list_for_version(current.id)
                    if i.repository_id == repository_id
                ]
            slices.append(
                RepoRoadmapSliceResult(
                    roadmap_id=roadmap.id,
                    name=roadmap.name,
                    goal=roadmap.goal,
                    status=roadmap.status,
                    version_number=current.number if current else None,
                    generation_status=newest.status if newest else None,
                    items_total=len(items),
                    items_done=sum(1 for i in items if i.status == "done"),
                    items=items,
                )
            )
        return slices

    def update(self, roadmap_id: uuid.UUID, data: UpdateRoadmap) -> RoadmapDetailResult:
        roadmap = self._require_roadmap(roadmap_id)
        repos = self._resolve_repositories(data.repository_ids)
        roadmap.name = data.name.strip()
        roadmap.goal = (data.goal or "").strip() or None
        roadmap.updated_at = datetime.now(UTC)
        self._roadmaps.set_repositories(roadmap_id, [r.id for r in repos])
        return self.get(roadmap_id)

    def delete(self, roadmap_id: uuid.UUID) -> None:
        self._require_roadmap(roadmap_id)
        self._roadmaps.delete(roadmap_id)

    # --- versions / generation ----------------------------------------------------------
    def regenerate(self, roadmap_id: uuid.UUID) -> RoadmapVersionResult:
        """Insert version N+1 and enqueue its generation job (non-blocking)."""
        roadmap = self._require_roadmap(roadmap_id)
        repos = self._resolve_repositories(self._roadmaps.repository_ids(roadmap_id))
        if not repos:
            raise ConflictError("This roadmap has no repositories to plan over.")
        version = self._enqueue_generation(roadmap, repos)
        return self._version_result(version)

    def list_versions(self, roadmap_id: uuid.UUID) -> list[RoadmapVersionResult]:
        self._require_roadmap(roadmap_id)
        return [self._version_result(v) for v in self._versions.list_for_roadmap(roadmap_id)]

    # --- execution -------------------------------------------------------------------------
    def execute_item(self, roadmap_id: uuid.UUID, item_id: uuid.UUID) -> RoadmapExecutionResult:
        """Dispatch an item to the engine: isolated worktree → agent implements → the completion
        handler commits, pushes and opens the PR. Non-blocking; the UI polls the detail."""
        from shire.domain.connections.services import ConnectionService
        from shire.domain.repository.domain import GitProvider
        from shire.domain.roadmap.execution import ExecutionError, create_execution_worktree

        roadmap, item = self._require_current_item(roadmap_id, item_id)
        if item.status not in ("todo", "in_progress"):
            raise ConflictError("Only items in 'to do' or 'in progress' can be dispatched.")
        blockers = self._items.dependencies_for_version(item.version_id).get(item.id, [])
        for blocker_id in blockers:
            blocker = self._items.get(blocker_id)
            if blocker is not None and blocker.status != "done":
                raise ConflictError(f"Blocked by an unfinished dependency: {blocker.title[:120]}")
        if item.repository_id is None:
            raise ConflictError("Portfolio-wide items have no repository to implement against.")
        repo = self._session.get(RepositoryRow, item.repository_id)
        if repo is None or not repo.clone_path:
            raise ConflictError("The item's repository has no local clone.")
        if repo.provider == GitProvider.local.value:
            raise ConflictError("Local repositories cannot receive pull requests.")
        if repo.connection_id is None:
            raise ConflictError("The repository has no connection with push credentials.")
        if ConnectionService(self._session).resolve_credential(repo.connection_id) is None:
            raise ConflictError("The repository's connection no longer exists.")
        if self._executions.has_pending(item.id):
            raise ConflictError("An execution for this item is already in flight.")

        branch = f"roadmap/{item.slug[:48]}-{uuid.uuid4().hex[:8]}"
        try:
            worktree, base_sha = create_execution_worktree(repo, branch)
        except ExecutionError as exc:
            raise ConflictError(str(exc)) from exc

        now = datetime.now(UTC)
        execution = RoadmapExecutionRow(
            item_id=item.id,
            status="pending",
            branch=branch,
            worktree_path=str(worktree),
            base_sha=base_sha,
            created_at=now,
        )
        self._executions.add(execution)

        jobs = JobService(self._session)
        model, _timeout = jobs.engine_defaults()
        config = self._config.get_or_create()
        job = jobs.enqueue(
            kind=job_kinds.ROADMAP_EXECUTE,
            title=f"Roadmap execute: {item.title[:80]}",
            prompt=build_execute_prompt(item, f"{repo.owner}/{repo.name}"),
            payload={
                # The agent works only inside the disposable worktree. Write access via
                # Edit/Write, deliberately NO Bash (arbitrary command execution); the PR +
                # repo CI is the safety net for unverified changes.
                "cwd": str(worktree),
                "model": model,
                "timeout_seconds": config.execution_timeout_seconds,
                "allowed_tools": ["Read", "Grep", "Glob", "Edit", "Write"],
                "execution_id": str(execution.id),
                "item_id": str(item.id),
                "branch": branch,
            },
            repository_id=repo.id,
        )
        execution.job_id = job.id
        if item.status == "todo":
            self._add_event(roadmap.id, item.id, "status", "todo", "in_progress", now)
            item.status = "in_progress"
            item.updated_at = now
        return RoadmapExecutionResult.of(execution)

    def list_executions(
        self, roadmap_id: uuid.UUID, *, item_id: uuid.UUID | None = None
    ) -> list[RoadmapExecutionResult]:
        roadmap = self._require_roadmap(roadmap_id)
        if item_id is not None:
            return [RoadmapExecutionResult.of(r) for r in self._executions.list_for_item(item_id)]
        if roadmap.current_version_id is None:
            return []
        return [
            RoadmapExecutionResult.of(r)
            for r in self._executions.list_for_version(roadmap.current_version_id)
        ]

    def refresh_executions(self, roadmap_id: uuid.UUID) -> RefreshPrsResult:
        """Provider-side PR sweep: merged PRs complete their items, closed ones bounce back to
        'to do'. Also sweeps crash-orphaned worktrees (cheap, and this is a natural tick)."""
        from shire.domain.connections.services import ConnectionService
        from shire.domain.repository.domain import GitProvider
        from shire.domain.roadmap.execution import cleanup_orphan_worktrees
        from shire.integrations.git_providers.registry import get_connector

        roadmap = self._require_roadmap(roadmap_id)
        cleanup_orphan_worktrees(self._session)
        if roadmap.current_version_id is None:
            return RefreshPrsResult(checked=0, updated_item_ids=[])

        connections = ConnectionService(self._session)
        executions = self._executions.latest_per_item(roadmap.current_version_id)
        now = datetime.now(UTC)
        checked = 0
        updated: list[uuid.UUID] = []
        for item in self._items.list_for_version(roadmap.current_version_id):
            if item.status != "in_progress" or item.repository_id is None:
                continue
            execution = executions.get(item.id)
            if execution is None or execution.pr_number is None:
                continue
            repo = self._session.get(RepositoryRow, item.repository_id)
            if repo is None or repo.connection_id is None:
                continue
            credential = connections.resolve_credential(repo.connection_id)
            if credential is None:
                continue
            checked += 1
            try:
                pr = get_connector(GitProvider(repo.provider)).get_pull_request(
                    credential, repo.owner, repo.name, execution.pr_number
                )
            except Exception:
                continue
            if pr.state == execution.pr_state:
                continue
            execution.pr_state = pr.state
            if pr.state == "merged":
                self._add_event(
                    roadmap.id, item.id, "status", item.status, "done", now, actor="system"
                )
                item.status = "done"
                item.updated_at = now
                updated.append(item.id)
            elif pr.state == "closed":
                self._add_event(
                    roadmap.id, item.id, "status", item.status, "todo", now, actor="system"
                )
                item.status = "todo"
                item.updated_at = now
                updated.append(item.id)
        return RefreshPrsResult(checked=checked, updated_item_ids=updated)

    # --- drift ---------------------------------------------------------------------------
    def run_drift(self, roadmap_id: uuid.UUID) -> list[RoadmapDriftCheckResult]:
        """One read-only engine job per repository with open items: does the plan still match
        the code? Also sweeps PRs first, so merge-completions don't surface as findings."""
        from shire.domain.roadmap.jobs import build_drift_prompt
        from shire.domain.roadmap.models import RoadmapDriftCheckRow

        roadmap = self._require_roadmap(roadmap_id)
        if roadmap.current_version_id is None:
            raise ConflictError("This roadmap has no generated version to check yet.")
        self.refresh_executions(roadmap_id)

        open_by_repo: dict[uuid.UUID, list[RoadmapItemRow]] = {}
        for item in self._items.list_for_version(roadmap.current_version_id):
            if item.status in ("todo", "in_progress") and item.repository_id:
                open_by_repo.setdefault(item.repository_id, []).append(item)
        if not open_by_repo:
            raise ConflictError("No open repository items to drift-check.")

        jobs = JobService(self._session)
        model, timeout_seconds = jobs.engine_defaults()
        now = datetime.now(UTC)
        results = []
        for repository_id, items in open_by_repo.items():
            repo = self._session.get(RepositoryRow, repository_id)
            if repo is None or not repo.clone_path:
                continue
            if self._has_pending_drift(roadmap.current_version_id, repository_id):
                continue
            branch = repo.current_branch or repo.default_branch
            check = RoadmapDriftCheckRow(
                version_id=roadmap.current_version_id,
                repository_id=repository_id,
                status="pending",
                branch=branch,
                created_at=now,
            )
            self._session.add(check)
            self._session.flush()
            job = jobs.enqueue(
                kind=job_kinds.ROADMAP_DRIFT,
                title=f"Roadmap drift: {repo.owner}/{repo.name}",
                prompt=build_drift_prompt(f"{repo.owner}/{repo.name}", items),
                payload={
                    # Read-only inspection inside the main clone (default tools).
                    "cwd": repo.clone_path,
                    "model": model,
                    "timeout_seconds": timeout_seconds,
                    "drift_check_id": str(check.id),
                    "item_ids": [str(i.id) for i in items],
                    "branch": branch,
                },
                repository_id=repository_id,
            )
            check.job_id = job.id
            results.append(RoadmapDriftCheckResult.of(check))
        if not results:
            raise ConflictError("A drift check is already in flight for every eligible repository.")
        return results

    def drift_status(self, roadmap_id: uuid.UUID) -> RoadmapDriftStatusResult:
        from shire.domain.roadmap.models import RoadmapDriftCheckRow, RoadmapDriftFindingRow

        roadmap = self._require_roadmap(roadmap_id)
        if roadmap.current_version_id is None:
            return RoadmapDriftStatusResult(checks=[], findings=[])
        checks = list(
            self._session.scalars(
                select(RoadmapDriftCheckRow)
                .where(RoadmapDriftCheckRow.version_id == roadmap.current_version_id)
                .order_by(RoadmapDriftCheckRow.created_at.desc())
                .limit(20)
            )
        )
        findings = list(
            self._session.scalars(
                select(RoadmapDriftFindingRow)
                .join(
                    RoadmapDriftCheckRow,
                    RoadmapDriftCheckRow.id == RoadmapDriftFindingRow.drift_check_id,
                )
                .where(
                    RoadmapDriftCheckRow.version_id == roadmap.current_version_id,
                    RoadmapDriftFindingRow.status == "open",
                )
                .order_by(RoadmapDriftFindingRow.created_at.desc())
            )
        )
        items = {i.id: i for i in self._items.list_for_version(roadmap.current_version_id)}
        return RoadmapDriftStatusResult(
            checks=[RoadmapDriftCheckResult.of(c) for c in checks],
            findings=[
                RoadmapDriftFindingResult.of(f, item=items[f.item_id])
                for f in findings
                if f.item_id in items
            ],
        )

    def accept_drift_finding(
        self, roadmap_id: uuid.UUID, finding_id: uuid.UUID
    ) -> RoadmapItemResult:
        finding, item = self._require_open_finding(roadmap_id, finding_id)
        now = datetime.now(UTC)
        # Both verdicts close the item: appears_done because the work exists, obsolete
        # because there is no work left to do.
        target = "done"
        if item.status != "done":
            self._add_event(roadmap_id, item.id, "status", item.status, target, now, actor="ai")
            item.status = target
            item.updated_at = now
        finding.status = "accepted"
        finding.decided_at = now
        deps = self._items.dependencies_for_version(item.version_id)
        return RoadmapItemResult.of(item, depends_on=deps.get(item.id, []))

    def dismiss_drift_finding(self, roadmap_id: uuid.UUID, finding_id: uuid.UUID) -> None:
        finding, _item = self._require_open_finding(roadmap_id, finding_id)
        finding.status = "dismissed"
        finding.decided_at = datetime.now(UTC)

    def _require_open_finding(self, roadmap_id: uuid.UUID, finding_id: uuid.UUID):
        from shire.domain.roadmap.models import RoadmapDriftCheckRow, RoadmapDriftFindingRow

        self._require_roadmap(roadmap_id)
        finding = self._session.get(RoadmapDriftFindingRow, finding_id)
        if finding is None:
            raise NotFoundError("Drift finding not found")
        check = self._session.get(RoadmapDriftCheckRow, finding.drift_check_id)
        version = self._versions.get(check.version_id) if check else None
        if version is None or version.roadmap_id != roadmap_id:
            raise NotFoundError("Drift finding not found")
        if finding.status != "open":
            raise ConflictError("This finding has already been decided.")
        item = self._items.get(finding.item_id)
        if item is None:
            raise NotFoundError("The finding's item no longer exists.")
        return finding, item

    def _has_pending_drift(self, version_id: uuid.UUID, repository_id: uuid.UUID) -> bool:
        from shire.domain.roadmap.models import RoadmapDriftCheckRow

        stmt = select(RoadmapDriftCheckRow.id).where(
            RoadmapDriftCheckRow.version_id == version_id,
            RoadmapDriftCheckRow.repository_id == repository_id,
            RoadmapDriftCheckRow.status == "pending",
        )
        return self._session.scalars(stmt).first() is not None

    # --- issues export ---------------------------------------------------------------------
    def export_issues(self, roadmap_id: uuid.UUID, data: ExportIssuesRequest) -> ExportIssuesResult:
        """Push items as provider issues (GitHub/GitLab). Synchronous — a handful of REST
        calls; unexportable items come back as skipped, never as an error."""
        from shire.domain.connections.services import ConnectionService
        from shire.domain.repository.domain import GitProvider
        from shire.integrations.git_providers.registry import get_connector

        roadmap = self._require_roadmap(roadmap_id)
        if roadmap.current_version_id is None:
            raise ConflictError("This roadmap has no generated version to export yet.")
        wanted_ids = set(data.item_ids or [])
        wanted_statuses = set(data.statuses or ("todo", "in_progress"))
        connections = ConnectionService(self._session)

        created = 0
        results: list[ExportedIssueResult] = []
        for item in self._items.list_for_version(roadmap.current_version_id):
            if wanted_ids and item.id not in wanted_ids:
                continue
            if item.status not in wanted_statuses:
                continue
            skipped_reason = None
            if item.issue_url:
                skipped_reason = "already exported"
            elif item.repository_id is None:
                skipped_reason = "portfolio-wide item"
            repo = (
                self._session.get(RepositoryRow, item.repository_id) if item.repository_id else None
            )
            credential = None
            if skipped_reason is None:
                if repo is None or repo.connection_id is None:
                    skipped_reason = "no connection"
                elif repo.provider not in (GitProvider.github.value, GitProvider.gitlab.value):
                    skipped_reason = "provider does not support issues"
                else:
                    credential = connections.resolve_credential(repo.connection_id)
                    if credential is None:
                        skipped_reason = "connection no longer exists"
            if skipped_reason is None and repo is not None and credential is not None:
                try:
                    issue = get_connector(GitProvider(repo.provider)).create_issue(
                        credential,
                        repo.owner,
                        repo.name,
                        title=item.title,
                        body=_issue_body(item),
                    )
                    item.issue_url = issue.url
                    created += 1
                except Exception as exc:
                    skipped_reason = str(exc)[:300]
            results.append(
                ExportedIssueResult(
                    item_id=item.id,
                    item_title=item.title,
                    issue_url=item.issue_url,
                    skipped_reason=skipped_reason,
                )
            )
        return ExportIssuesResult(created=created, skipped=len(results) - created, items=results)

    # --- config --------------------------------------------------------------------------
    def get_config(self) -> RoadmapConfigResult:
        return self._config_result(self._config.get_or_create())

    def update_config(self, data: UpdateRoadmapConfig) -> RoadmapConfigResult:
        from shire.orchestration.schedule_sync import PrefectScheduleSync, validate_cadence

        try:
            validate_cadence(data.drift_cadence)
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc
        row = self._config.get_or_create()
        row.execution_timeout_seconds = data.execution_timeout_seconds
        row.drift_cadence = data.drift_cadence.strip()
        row.updated_at = datetime.now(UTC)
        PrefectScheduleSync(self._session).sync_roadmap()
        return self._config_result(row)

    def _config_result(self, row) -> RoadmapConfigResult:
        from shire.core.settings import get_settings

        return RoadmapConfigResult(
            execution_timeout_seconds=row.execution_timeout_seconds,
            drift_cadence=row.drift_cadence,
            scheduler_enabled=get_settings().scheduler_enabled,
            updated_at=row.updated_at,
        )

    # --- charts / export -------------------------------------------------------------------
    def burnup(self, roadmap_id: uuid.UUID, *, days: int = 90) -> BurnupResult:
        """Scope vs completion per day for the current version, from the event log."""
        roadmap = self._require_roadmap(roadmap_id)
        if roadmap.current_version_id is None:
            return BurnupResult(series=[])
        items = self._items.list_for_version(roadmap.current_version_id)
        if not items:
            return BurnupResult(series=[])

        events = self._session.scalars(
            select(RoadmapItemEventRow)
            .where(
                RoadmapItemEventRow.item_id.in_([i.id for i in items]),
                RoadmapItemEventRow.kind.in_(("created", "status", "carried")),
            )
            .order_by(RoadmapItemEventRow.created_at.asc())
        ).all()
        if not events:
            return BurnupResult(series=[])

        # Per item: chronological (day, state) — the state at end of a day is the last entry ≤ it.
        timelines: dict[uuid.UUID, list[tuple[date, str]]] = {}
        for event in events:
            timelines.setdefault(event.item_id, []).append(
                (event.created_at.date(), event.to_value or "todo")
            )

        today = datetime.now(UTC).date()
        start = max(min(t[0][0] for t in timelines.values()), today - timedelta(days=days))
        series: list[BurnupPoint] = []
        day = start
        while day <= today:
            total = done = 0
            for timeline in timelines.values():
                state = None
                for event_day, value in timeline:
                    if event_day > day:
                        break
                    state = value
                if state is None:
                    continue
                total += 1
                if state == "done":
                    done += 1
            series.append(BurnupPoint(day=day, total=total, done=done))
            day += timedelta(days=1)
        return BurnupResult(series=series)

    def radar(self, roadmap_id: uuid.UUID) -> RadarResult:
        """The last two ready versions' assessments (current radar + previous for trend)."""
        self._require_roadmap(roadmap_id)
        ready = [v for v in self._versions.list_for_roadmap(roadmap_id) if v.status == "ready"]
        current = ready[0] if ready else None
        previous = ready[1] if len(ready) > 1 else None
        current_assessments = (current.assessments or []) if current else []
        previous_assessments = (previous.assessments or []) if previous else []
        return RadarResult(
            current=[RepoAssessmentResult(**a) for a in current_assessments],
            current_version=current.number if current else None,
            previous=[RepoAssessmentResult(**a) for a in previous_assessments],
            previous_version=previous.number if previous else None,
        )

    def export_markdown(self, roadmap_id: uuid.UUID) -> tuple[str, str]:
        """(markdown, filename) for the current version."""
        from shire.domain.roadmap.export import render_markdown

        roadmap = self._require_roadmap(roadmap_id)
        if roadmap.current_version_id is None:
            raise ConflictError("This roadmap has no generated version to export yet.")
        version = self._versions.get(roadmap.current_version_id)
        if version is None:
            raise NotFoundError("Roadmap version not found")
        items = self._items.list_for_version(version.id)
        repos = {
            r.id: r
            for r in self._resolve_repositories(
                [i.repository_id for i in items if i.repository_id], must_exist=False
            )
        }
        markdown = render_markdown(
            roadmap,
            version,
            self._items.milestones_for_version(version.id),
            items,
            repos,
        )
        slug = "".join(c if c.isalnum() else "-" for c in roadmap.name.lower()).strip("-")
        return markdown, f"{slug or 'roadmap'}-v{version.number}.md"

    # --- items ---------------------------------------------------------------------------
    def update_item(
        self, roadmap_id: uuid.UUID, item_id: uuid.UUID, data: UpdateRoadmapItem
    ) -> RoadmapItemResult:
        roadmap, item = self._require_current_item(roadmap_id, item_id)
        now = datetime.now(UTC)

        auto_dispatch = False
        if data.status is not None and data.status != item.status:
            allowed = ITEM_TRANSITIONS.get(item.status, ())
            if data.status not in allowed:
                raise ConflictError(f"Cannot move an item from '{item.status}' to '{data.status}'.")
            self._add_event(roadmap.id, item.id, "status", item.status, data.status, now)
            # Starting work on a ticket starts the AI on it: todo → in_progress auto-dispatches
            # the implementation job (skipped quietly when the item isn't dispatchable).
            auto_dispatch = item.status == "todo" and data.status == "in_progress"
            item.status = data.status

        if (data.urgent is not None and data.urgent != item.urgent) or (
            data.important is not None and data.important != item.important
        ):
            before = quadrant_of(urgent=item.urgent, important=item.important)
            item.urgent = item.urgent if data.urgent is None else data.urgent
            item.important = item.important if data.important is None else data.important
            after = quadrant_of(urgent=item.urgent, important=item.important)
            if after != before:
                self._add_event(roadmap.id, item.id, "priority", before, after, now)

        if data.effort is not None and data.effort != item.effort:
            if data.effort not in ITEM_EFFORTS:
                raise ValidationError(f"Effort must be one of {', '.join(ITEM_EFFORTS)}.")
            self._add_event(roadmap.id, item.id, "effort", item.effort, data.effort, now)
            item.effort = data.effort

        if data.milestone_id is not None and data.milestone_id != item.milestone_id:
            milestone = self._items.get_milestone(data.milestone_id)
            if milestone is None or milestone.version_id != item.version_id:
                raise ValidationError("Milestone does not belong to this roadmap version.")
            self._add_event(
                roadmap.id, item.id, "milestone", str(item.milestone_id), str(milestone.id), now
            )
            item.milestone_id = milestone.id

        if data.position is not None:
            item.position = data.position
        if data.title is not None:
            item.title = data.title.strip()[:300]
        if data.description is not None:
            item.description = data.description.strip() or None

        item.updated_at = now

        if auto_dispatch:
            # Not dispatchable (portfolio item, no connection, blocked, run already in
            # flight, ...) → the status change stands; the dialog's button explains why.
            with contextlib.suppress(ConflictError):
                self.execute_item(roadmap_id, item_id)

        deps = self._items.dependencies_for_version(item.version_id)
        executions = self._executions.list_for_item(item.id)
        return RoadmapItemResult.of(
            item,
            depends_on=deps.get(item.id, []),
            execution=executions[0] if executions else None,
        )

    def add_dependency(
        self, roadmap_id: uuid.UUID, item_id: uuid.UUID, data: CreateItemDependency
    ) -> RoadmapItemResult:
        _, item = self._require_current_item(roadmap_id, item_id)
        dep = self._items.get(data.depends_on_item_id)
        if dep is None or dep.version_id != item.version_id:
            raise NotFoundError("Dependency target not found in this roadmap version.")
        if dep.id == item.id:
            raise ValidationError("An item cannot depend on itself.")
        if self._items.dependency_exists(item.id, dep.id):
            raise ConflictError("This dependency already exists.")

        deps = self._items.dependencies_for_version(item.version_id)
        if self._reaches(deps, start=dep.id, target=item.id):
            raise ConflictError("This dependency would create a cycle.")

        self._items.add_dependency(
            RoadmapItemDependencyRow(item_id=item.id, depends_on_item_id=dep.id, created_by="user")
        )
        deps.setdefault(item.id, []).append(dep.id)
        return RoadmapItemResult.of(item, depends_on=deps.get(item.id, []))

    def remove_dependency(
        self, roadmap_id: uuid.UUID, item_id: uuid.UUID, depends_on_item_id: uuid.UUID
    ) -> None:
        self._require_current_item(roadmap_id, item_id)
        if not self._items.delete_dependency(item_id, depends_on_item_id):
            raise NotFoundError("Dependency not found")

    # --- internals -------------------------------------------------------------------------
    def _require_roadmap(self, roadmap_id: uuid.UUID) -> RoadmapRow:
        row = self._roadmaps.get(roadmap_id)
        if row is None:
            raise NotFoundError("Roadmap not found")
        return row

    def _require_current_item(
        self, roadmap_id: uuid.UUID, item_id: uuid.UUID
    ) -> tuple[RoadmapRow, RoadmapItemRow]:
        """The item, provided it belongs to the roadmap's *current* version (old versions are
        immutable history)."""
        roadmap = self._require_roadmap(roadmap_id)
        item = self._items.get(item_id)
        if item is None:
            raise NotFoundError("Roadmap item not found")
        version = self._versions.get(item.version_id)
        if version is None or version.roadmap_id != roadmap_id:
            raise NotFoundError("Roadmap item not found")
        if roadmap.current_version_id != version.id:
            raise ConflictError("Items of a superseded roadmap version are read-only.")
        return roadmap, item

    def _add_event(
        self,
        roadmap_id: uuid.UUID,
        item_id: uuid.UUID,
        kind: str,
        from_value: str | None,
        to_value: str | None,
        now: datetime,
        *,
        actor: str = "user",
    ) -> None:
        self._items.add_event(
            RoadmapItemEventRow(
                roadmap_id=roadmap_id,
                item_id=item_id,
                kind=kind,
                from_value=from_value,
                to_value=to_value,
                actor=actor,
                created_at=now,
            )
        )

    @staticmethod
    def _reaches(
        deps: dict[uuid.UUID, list[uuid.UUID]], *, start: uuid.UUID, target: uuid.UUID
    ) -> bool:
        stack, visited = [start], set()
        while stack:
            node = stack.pop()
            if node == target:
                return True
            if node in visited:
                continue
            visited.add(node)
            stack.extend(deps.get(node, ()))
        return False

    def _resolve_repositories(
        self, repository_ids: list[uuid.UUID], *, must_exist: bool = True
    ) -> list[RepositoryRow]:
        unique = list(dict.fromkeys(repository_ids))
        rows = {
            r.id: r
            for r in self._session.scalars(
                select(RepositoryRow).where(RepositoryRow.id.in_(unique))
            )
        }
        if must_exist:
            missing = [str(i) for i in unique if i not in rows]
            if missing:
                raise NotFoundError(f"Unknown repositories: {', '.join(missing)}")
        return [rows[i] for i in unique if i in rows]

    def _version_result(self, version: RoadmapVersionRow) -> RoadmapVersionResult:
        return RoadmapVersionResult.of(
            version, item_count=self._items.count_for_version(version.id)
        )

    def _enqueue_generation(
        self, roadmap: RoadmapRow, repos: list[RepositoryRow]
    ) -> RoadmapVersionRow:
        if self._versions.has_pending(roadmap.id):
            raise ConflictError("A generation for this roadmap is already in flight.")

        previous = (
            self._versions.get(roadmap.current_version_id) if roadmap.current_version_id else None
        )
        done_titles: list[str] = []
        open_items: list[str] = []
        if previous is not None:
            for item in self._items.list_for_version(previous.id)[:_PREVIOUS_ITEMS_LIMIT]:
                if item.status == "done":
                    done_titles.append(item.title)
                else:
                    open_items.append(f"{item.title} [{item.label}, {item.status}]")

        version = RoadmapVersionRow(
            roadmap_id=roadmap.id,
            number=self._versions.next_number(roadmap.id),
            status="pending",
            goal_snapshot=roadmap.goal,
            repository_ids=[str(r.id) for r in repos],
            created_at=datetime.now(UTC),
        )
        self._versions.add(version)

        jobs = JobService(self._session)
        model, timeout_seconds = jobs.engine_defaults()
        job = jobs.enqueue(
            kind=job_kinds.ROADMAP_GENERATE,
            title=f"Roadmap: {roadmap.name} — v{version.number}",
            prompt=build_generate_prompt(
                goal=roadmap.goal,
                digest=self._roadmap_digest(repos),
                done_titles=done_titles,
                open_items=open_items,
            ),
            # No tools: the digest is embedded in the prompt (the news.recommend pattern).
            payload={
                "model": model,
                "timeout_seconds": timeout_seconds,
                "roadmap_id": str(roadmap.id),
                "version_id": str(version.id),
            },
        )
        version.job_id = job.id
        return version

    # --- the generation digest ----------------------------------------------------------
    def _roadmap_digest(self, repos: list[RepositoryRow]) -> str:
        """A compact markdown digest of the selected repositories: analysis substrate,
        violated principles, briefing findings, plus a shared recent-news section."""
        repo_pool = _DIGEST_TOTAL_BUDGET - _DIGEST_NEWS_BUDGET
        per_repo_budget = min(
            _DIGEST_REPO_BUDGET_CAP,
            max(_DIGEST_REPO_BUDGET_FLOOR, repo_pool // max(len(repos), 1)),
        )
        sections = [self._repo_section(repo)[:per_repo_budget] for repo in repos]
        news = self._news_section()
        if news:
            sections.append(news[:_DIGEST_NEWS_BUDGET])
        return "\n\n".join(s for s in sections if s)[:_DIGEST_TOTAL_BUDGET]

    def _repo_section(self, repo: RepositoryRow) -> str:
        lines = [f"### {repo.owner}/{repo.name}"]
        analysis = self._session.scalars(
            select(AnalysisRow)
            .where(AnalysisRow.repository_id == repo.id)
            .order_by(AnalysisRow.analyzed_at.desc())
            .limit(1)
        ).first()

        if analysis is None:
            lines.append("- Not analyzed yet — plan only from the facts above and the goal.")
        else:
            if analysis.primary_language:
                lines.append(
                    f"- {analysis.primary_language}, {analysis.loc_total:,} LOC, "
                    f"{analysis.commit_count:,} commits"
                )
            scores = []
            if analysis.health_score is not None:
                scores.append(f"health {analysis.health_score:.0f}/100")
            if analysis.maintainability_index is not None:
                scores.append(f"maintainability index {analysis.maintainability_index:.0f}")
            if analysis.ccn_average is not None:
                scores.append(
                    f"avg complexity {analysis.ccn_average:.1f} "
                    f"({analysis.high_complexity_count or 0} high-complexity functions)"
                )
            if scores:
                lines.append(f"- Quality: {', '.join(scores)}")
            tests = []
            if analysis.test_to_code_ratio is not None:
                tests.append(f"test/code ratio {analysis.test_to_code_ratio:.2f}")
            if analysis.test_coverage_pct is not None:
                tests.append(f"coverage {analysis.test_coverage_pct:.0f}%")
            if not analysis.has_tests:
                tests.append("no tests detected")
            if tests:
                lines.append(f"- Testing: {', '.join(tests)}")
            if analysis.vulnerability_count:
                lines.append(
                    f"- Vulnerabilities: {analysis.vulnerability_count} "
                    f"(critical {analysis.vuln_critical}, high {analysis.vuln_high})"
                )
                vulns = self._session.scalars(
                    select(VulnerabilityRow)
                    .where(VulnerabilityRow.analysis_id == analysis.id)
                    .order_by(VulnerabilityRow.severity)
                    .limit(_DIGEST_VULN_PACKAGES_PER_REPO)
                ).all()
                for v in vulns:
                    fix = f" (fixed in {v.fixed_version})" if v.fixed_version else ""
                    lines.append(f"  - {v.package} {v.version or ''}: {v.severity}{fix}")
            activity = []
            if analysis.days_since_last_commit is not None:
                activity.append(f"last commit {analysis.days_since_last_commit}d ago")
            if analysis.maintenance_status:
                activity.append(analysis.maintenance_status)
            if analysis.bus_factor is not None:
                activity.append(f"bus factor {analysis.bus_factor}")
            if activity:
                lines.append(f"- Activity: {', '.join(activity)}")
            hotspots = self._session.scalars(
                select(HotspotRow)
                .where(HotspotRow.analysis_id == analysis.id)
                .order_by(HotspotRow.score.desc())
                .limit(_DIGEST_HOTSPOTS_PER_REPO)
            ).all()
            if hotspots:
                lines.append("- Hotspots (churn x size): " + ", ".join(h.path for h in hotspots))
            deps = self._session.execute(
                select(DependencyRow.name, DependencyRow.version)
                .where(DependencyRow.analysis_id == analysis.id, DependencyRow.is_dev.is_(False))
                .order_by(DependencyRow.name)
                .limit(_DIGEST_DEPS_PER_REPO)
            ).all()
            if deps:
                lines.append(
                    "- Key dependencies: " + ", ".join(f"{n} {v}" if v else n for n, v in deps)
                )

        violated = self._violated_principles(repo.id)
        if violated:
            lines.append("- Violated principles:")
            lines.extend(f"  - [{sev}] {name}: {summary}" for name, sev, summary in violated)

        briefing = self._session.scalars(
            select(BriefingItemRow)
            .where(BriefingItemRow.repository_id == repo.id)
            .order_by(BriefingItemRow.importance.desc(), BriefingItemRow.created_at.desc())
            .limit(_DIGEST_BRIEFING_PER_REPO)
        ).all()
        if briefing:
            lines.append("- Recent findings:")
            lines.extend(f"  - [{b.tier}] {b.headline}" for b in briefing)

        pack = self._session.get(ContextPackRow, repo.id)
        if pack is not None and pack.narrative:
            lines.append(f"- Narrative: {pack.narrative[:_DIGEST_NARRATIVE_CHARS]}")
        return "\n".join(lines)

    def _violated_principles(self, repository_id: uuid.UUID) -> list[tuple[str, str, str]]:
        """(name, severity, summary) for each principle whose newest check is `violated`."""
        checks = self._session.scalars(
            select(PrincipleCheckRow)
            .where(PrincipleCheckRow.repository_id == repository_id)
            .order_by(PrincipleCheckRow.created_at.asc())
        ).all()
        newest: dict[uuid.UUID, PrincipleCheckRow] = {}
        for check in checks:
            newest[check.principle_id] = check  # ascending order → last write wins
        violated = [c for c in newest.values() if c.status == "violated"]
        if not violated:
            return []
        principles = {
            p.id: p
            for p in self._session.scalars(
                select(PrincipleRow).where(PrincipleRow.id.in_([c.principle_id for c in violated]))
            )
        }
        results = []
        for check in violated[:_DIGEST_VIOLATIONS_PER_REPO]:
            principle = principles.get(check.principle_id)
            if principle is not None:
                results.append((principle.name, principle.severity, check.summary or ""))
        return results

    def _news_section(self) -> str:
        items = self._session.scalars(
            select(NewsItemRow).order_by(NewsItemRow.created_at.desc()).limit(_DIGEST_NEWS_ITEMS)
        ).all()
        if not items:
            return ""
        lines = ["### Recent ecosystem news (portfolio-wide)"]
        lines.extend(f"- {i.title}" + (f" — {i.summary}" if i.summary else "") for i in items)
        return "\n".join(lines)


def _issue_body(item: RoadmapItemRow) -> str:
    parts = [
        f"_Roadmap item — {item.label}, "
        f"{'urgent' if item.urgent else 'not urgent'}/"
        f"{'important' if item.important else 'not important'}"
        + (f", effort {item.effort}" if item.effort else "")
        + "._"
    ]
    if item.description:
        parts.append(item.description.strip())
    if item.rationale:
        parts.append(f"**Why:** {item.rationale.strip()}")
    parts.append("🤖 Exported from the Shire roadmap.")
    return "\n\n".join(parts)
