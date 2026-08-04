"""Inspection read model + bulk runner.

A read-model domain (no models of its own, like `home` and `watchlist`): it composes the
substrate / cicd / readiness services and answers three questions — what has been run for a
repository, how does that look across every repository, and start the ones that haven't.

The cross-repo overview is deliberately built from bulk queries rather than a loop of
per-repo aggregates: `latest_complete_meta()` plus a handful of grouped reads, in the shape
the members dashboard already uses, so an N-row table costs a constant number of queries.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from fastapi import BackgroundTasks
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from shire.core.exceptions import AppError, NotFoundError
from shire.core.settings import get_settings
from shire.domain.cicd.models import CicdAnalysisRow
from shire.domain.cicd.services import CicdService
from shire.domain.inspections import catalog
from shire.domain.inspections.schemas import (
    InspectionDetailResult,
    InspectionItemResult,
    InspectionOverviewItem,
    RunInspectionsResult,
    SkippedInspection,
)
from shire.domain.jobs import kinds as job_kinds
from shire.domain.jobs.repositories import SqlJobRepository
from shire.domain.readiness.models import ReadinessSuggestionRow
from shire.domain.readiness.services import ReadinessService
from shire.domain.repository.domain import Repository
from shire.domain.repository.repositories import SqlRepositoryRepository
from shire.domain.substrate.models import ArtifactVersionRow, DependencyRow, ToolRunRow
from shire.domain.substrate.repositories import (
    SqlAnalysisRepository,
    SqlCommitRecordRepository,
)
from shire.domain.substrate.services import AnalysisService
from shire.domain.tools.models import ToolRow
from shire.integrations.external_tools.codecharta import CodeChartaAdapter
from shire.integrations.external_tools.emerge import EmergeAdapter
from shire.integrations.external_tools.git_of_theseus import GitOfTheseusAdapter

DEFAULT_ACTIVITY_DAYS = 30

# `artifact_versions.artifact` → inspection key. Architecture is per-kind, handled separately.
_ARTIFACT_KEYS = {
    "codebase-overview": "codebase-overview",
    "tech-stack": "tech-stack",
}

# The engine job behind each AI inspection, for in-flight detection.
_JOB_KINDS = {
    "codebase-overview": job_kinds.SUBSTRATE_CODEBASE_OVERVIEW,
    "tech-stack": job_kinds.SUBSTRATE_TECH_STACK,
    "cicd": job_kinds.CICD_SCAN,
    "dependencies-ai": job_kinds.SUBSTRATE_DEPENDENCY_AI_SCAN,
    "dependency-freshness": job_kinds.SUBSTRATE_DEPENDENCY_GAINS,
    "ai-readiness": job_kinds.READINESS_SUGGEST,
}


class InspectionService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repos = SqlRepositoryRepository(session)
        self._analyses = SqlAnalysisRepository(session)
        self._commit_records = SqlCommitRecordRepository(session)
        self._jobs = SqlJobRepository(session)

    # --- reads -----------------------------------------------------------------
    def overview(
        self, repos: list[uuid.UUID] | None = None, days: int = DEFAULT_ACTIVITY_DAYS
    ) -> list[InspectionOverviewItem]:
        """Completion counts + recent commit activity for every requested repository
        (all of them when `repos` is omitted, mirroring the pulse endpoint)."""
        wanted = set(repos) if repos else None
        repositories = [r for r in self._repos.list() if wanted is None or r.id in wanted]
        if not repositories:
            return []

        done = self._done_at_by_repository(repositories)
        activity = self._daily_commits(repositories, days)
        total = len(catalog.CATALOG)
        return [
            InspectionOverviewItem(
                repository_id=repo.id,
                slug=repo.coordinates.slug,
                completed=len(done.get(repo.id, {})),
                total=total,
                daily_commits=activity.get(repo.id, [0] * days),
            )
            for repo in repositories
        ]

    def detail(self, repository_id: uuid.UUID) -> InspectionDetailResult:
        """Every inspection's state for one repository — the Suggested Actions checklist."""
        repo = self._repos.get(repository_id)
        if repo is None:
            raise NotFoundError("Repository not found")

        done = self._done_at_by_repository([repo]).get(repository_id, {})
        in_flight = self._in_flight_keys(repository_id)
        availability = self._tool_availability()
        cloned = bool(repo.clone_path) and Path(repo.clone_path).is_dir()

        items: list[InspectionItemResult] = []
        for entry in catalog.CATALOG:
            reason = self._unavailable_reason(entry, cloned=cloned, availability=availability)
            items.append(
                InspectionItemResult(
                    key=entry.key,
                    group=entry.group,
                    done=entry.key in done,
                    generated_at=done.get(entry.key),
                    runnable=reason is None,
                    unavailable_reason=reason,
                    in_flight=entry.key in in_flight,
                )
            )
        return InspectionDetailResult(
            repository_id=repository_id,
            completed=len(done),
            total=len(catalog.CATALOG),
            items=items,
        )

    # --- writes ----------------------------------------------------------------
    def run(
        self,
        repository_id: uuid.UUID,
        keys: list[str] | None,
        background_tasks: BackgroundTasks,
    ) -> RunInspectionsResult:
        """Start the requested inspections. `keys=None` means every bulk-eligible one that
        isn't done yet. Preconditions and in-flight duplicates are reported as skips rather
        than failing the whole request — one un-cloned repo in a bulk selection shouldn't
        sink the other twenty."""
        repo = self._repos.get(repository_id)
        if repo is None:
            raise NotFoundError("Repository not found")

        done = self._done_at_by_repository([repo]).get(repository_id, {})
        in_flight = self._in_flight_keys(repository_id)
        availability = self._tool_availability()
        cloned = bool(repo.clone_path) and Path(repo.clone_path).is_dir()
        requested = keys if keys is not None else [k for k in catalog.BULK_KEYS if k not in done]

        queued: list[str] = []
        skipped: list[SkippedInspection] = []
        for key in requested:
            entry = catalog.CATALOG_BY_KEY.get(key)
            if entry is None:
                skipped.append(SkippedInspection(key=key, reason="unknown_key"))
                continue
            # The same gate the checklist renders, applied before anything is started —
            # otherwise an uninstalled tool reports "queued" and then fails out of sight in
            # its background task.
            reason = self._unavailable_reason(entry, cloned=cloned, availability=availability)
            if reason is not None:
                skipped.append(SkippedInspection(key=key, reason=reason))
                continue
            if key in in_flight:
                skipped.append(SkippedInspection(key=key, reason="in_flight"))
                continue
            # Only an explicit request may re-run something already done (the checklist's
            # per-row button); the implicit bulk set has already filtered these out.
            if keys is None and key in done:
                skipped.append(SkippedInspection(key=key, reason="already_done"))
                continue
            try:
                self._start(entry, repository_id, background_tasks)
            except AppError as exc:
                skipped.append(
                    SkippedInspection(key=key, reason="not_runnable", detail=str(exc.detail))
                )
                continue
            queued.append(key)

        return RunInspectionsResult(
            repository_id=repository_id, queued=queued, skipped=skipped
        )

    def _start(
        self,
        entry: catalog.Inspection,
        repository_id: uuid.UUID,
        background_tasks: BackgroundTasks,
    ) -> None:
        """Enqueue an engine job, or hand a blocking run to a background task so the request
        returns immediately (the pattern `ingest_repository` uses for the clone pipeline)."""
        kind = entry.architecture_kind
        if kind is not None:
            AnalysisService(self._session).enqueue_architecture_diagram(repository_id, kind)
            return

        tool_id = entry.tool_id
        if tool_id is not None:
            background_tasks.add_task(_run_tool_in_background, repository_id, tool_id)
            return

        if entry.key == "codebase-overview":
            AnalysisService(self._session).enqueue_codebase_overview(repository_id)
        elif entry.key == "tech-stack":
            AnalysisService(self._session).enqueue_tech_stack(repository_id)
        elif entry.key == "dependencies-ai":
            AnalysisService(self._session).enqueue_ai_dependency_scan(repository_id)
        elif entry.key == "cicd":
            CicdService(self._session).enqueue_scan(repository_id)
        elif entry.key == "ai-readiness":
            ReadinessService(self._session).enqueue_suggest(repository_id)
        elif entry.key == "dependency-freshness":
            background_tasks.add_task(_run_freshness_in_background, repository_id)
        else:  # pragma: no cover - a catalog entry with no runner is a programming error
            raise NotFoundError(f"No runner for inspection '{entry.key}'")

    # --- completion ------------------------------------------------------------
    def _done_at_by_repository(
        self, repositories: list[Repository]
    ) -> dict[uuid.UUID, dict[str, datetime | None]]:
        """repository id -> inspection key -> when it was produced (None when unknown).

        DB-backed wherever the result is a row: `artifact_versions` records every generation
        of the overview / tech-stack / per-kind architecture artifacts, so those come from one
        indexed query across all repos. Only dependency freshness and the four visualization
        artifacts are disk-only singletons, and those are a handful of stats per repo.
        """
        repo_ids = [repo.id for repo in repositories]
        done: dict[uuid.UUID, dict[str, datetime | None]] = defaultdict(dict)

        artifacts = self._session.execute(
            select(
                ArtifactVersionRow.repository_id,
                ArtifactVersionRow.artifact,
                ArtifactVersionRow.kind,
                func.max(ArtifactVersionRow.created_at),
            )
            .where(ArtifactVersionRow.repository_id.in_(repo_ids))
            .group_by(
                ArtifactVersionRow.repository_id,
                ArtifactVersionRow.artifact,
                ArtifactVersionRow.kind,
            )
        )
        for repo_id, artifact, kind, created_at in artifacts:
            if artifact == "architecture" and kind:
                done[repo_id][f"{catalog.ARCHITECTURE_PREFIX}{kind}"] = created_at
            elif key := _ARTIFACT_KEYS.get(artifact):
                done[repo_id][key] = created_at

        cicd = self._session.execute(
            select(CicdAnalysisRow.repository_id, CicdAnalysisRow.generated_at).where(
                CicdAnalysisRow.repository_id.in_(repo_ids)
            )
        )
        for repo_id, generated_at in cicd:
            done[repo_id]["cicd"] = generated_at

        readiness = self._session.execute(
            select(
                ReadinessSuggestionRow.repository_id,
                func.max(ReadinessSuggestionRow.created_at),
            )
            .where(ReadinessSuggestionRow.repository_id.in_(repo_ids))
            .group_by(ReadinessSuggestionRow.repository_id)
        )
        for repo_id, created_at in readiness:
            done[repo_id]["ai-readiness"] = created_at

        # Everything hanging off an analysis snapshot: the AI dependency scan and the
        # scanner tools that actually contributed to the latest complete analysis.
        latest = {
            repo_id: (analysis_id, analyzed_at)
            for repo_id, analysis_id, analyzed_at in self._latest_analyses(repo_ids)
        }
        by_analysis = {analysis_id: repo_id for repo_id, (analysis_id, _) in latest.items()}
        if by_analysis:
            analysis_ids = list(by_analysis)
            ai_deps = self._session.execute(
                select(DependencyRow.analysis_id)
                .where(
                    DependencyRow.analysis_id.in_(analysis_ids),
                    DependencyRow.source == "ai",
                )
                .distinct()
            )
            for (analysis_id,) in ai_deps:
                repo_id = by_analysis[analysis_id]
                done[repo_id]["dependencies-ai"] = latest[repo_id][1]

            tool_runs = self._session.execute(
                select(ToolRunRow.analysis_id, ToolRunRow.name)
                .where(
                    ToolRunRow.analysis_id.in_(analysis_ids),
                    ToolRunRow.contributed.is_(True),
                )
                .distinct()
            )
            for analysis_id, name in tool_runs:
                repo_id = by_analysis[analysis_id]
                done[repo_id][f"{catalog.TOOL_PREFIX}{name}"] = latest[repo_id][1]

        for repo in repositories:
            for key, path in _disk_artifacts(repo.id).items():
                if path.is_file():
                    done[repo.id][key] = datetime.fromtimestamp(path.stat().st_mtime, tz=UTC)

        return done

    def _latest_analyses(
        self, repo_ids: list[uuid.UUID]
    ) -> list[tuple[uuid.UUID, uuid.UUID, datetime | None]]:
        wanted = set(repo_ids)
        return [
            (repo_id, analysis_id, analyzed_at)
            for repo_id, analysis_id, analyzed_at in self._analyses.latest_complete_stamps()
            if repo_id in wanted
        ]

    def _daily_commits(
        self, repositories: list[Repository], days: int
    ) -> dict[uuid.UUID, list[int]]:
        """repository id -> dense daily commit counts, oldest first.

        Zero-filled here rather than in the client, the way `MemberSummaryResult.weekly_commits`
        is built — the table renders the array straight into a sparkline.
        """
        repo_ids = [repo.id for repo in repositories]
        latest = {
            analysis_id: repo_id
            for repo_id, analysis_id, _ in self._latest_analyses(repo_ids)
        }
        today = datetime.now(tz=UTC).date()
        grid = [today - timedelta(days=offset) for offset in range(days - 1, -1, -1)]
        if not latest:
            return {}

        since = datetime.combine(grid[0], datetime.min.time(), tzinfo=UTC)
        counts = self._commit_records.daily_counts_by_analysis(list(latest), since)
        activity: dict[uuid.UUID, list[int]] = {}
        for analysis_id, per_day in counts.items():
            by_date: dict[date, int] = {
                day.date() if isinstance(day, datetime) else day: count
                for day, count in per_day.items()
            }
            activity[latest[analysis_id]] = [by_date.get(day, 0) for day in grid]
        return activity

    # --- runnability -----------------------------------------------------------
    def _tool_availability(self) -> dict[str, bool]:
        """Availability from the persisted tools catalog — probing each binary shells out to
        `<tool> --version`, far too expensive to do per request."""
        rows = self._session.execute(select(ToolRow.id, ToolRow.available)).all()
        return {tool_id: bool(available) for tool_id, available in rows}

    def _in_flight_keys(self, repository_id: uuid.UUID) -> set[str]:
        keys: set[str] = set()
        by_kind = {kind: key for key, kind in _JOB_KINDS.items()}
        for job in self._jobs.unsettled_for_repository(repository_id):
            if job.kind == job_kinds.SUBSTRATE_ARCHITECTURE:
                kind = (job.payload or {}).get("kind")
                if kind:
                    keys.add(f"{catalog.ARCHITECTURE_PREFIX}{kind}")
            elif key := by_kind.get(job.kind):
                keys.add(key)
        return keys

    def _unavailable_reason(
        self,
        entry: catalog.Inspection,
        *,
        cloned: bool,
        availability: dict[str, bool],
    ) -> str | None:
        if not cloned:
            return "not_cloned"
        tool_id = entry.tool_id
        if tool_id is not None and not availability.get(tool_id, False):
            return "tool_unavailable"
        return None


def _disk_artifacts(repository_id: uuid.UUID) -> dict[str, Path]:
    """The inspections whose only record is a file on disk, and where that file lives.

    Mirrors the paths each `*_status` method in `AnalysisService` checks; kept here so the
    cross-repo overview can stat them without paying for those methods' tool-availability
    probes.
    """
    settings = get_settings()
    artifacts = settings.artifacts_root
    repo = str(repository_id)
    return {
        "dependency-freshness": artifacts / "dependency-freshness" / repo / "freshness.json",
        f"{catalog.TOOL_PREFIX}emerge": settings.graph_root / repo / EmergeAdapter.HTML_ENTRY,
        f"{catalog.TOOL_PREFIX}git-of-theseus": artifacts
        / "git-of-theseus"
        / repo
        / GitOfTheseusAdapter.SVG_NAME,
        f"{catalog.TOOL_PREFIX}code-maat": artifacts / "code-maat" / repo / "coupling.json",
        f"{catalog.TOOL_PREFIX}codecharta": artifacts
        / "codecharta"
        / repo
        / CodeChartaAdapter.MAP_NAME,
    }


# Blocking runs happen in a background task with their own session — the request's session is
# closed by the time these fire.
def _run_tool_in_background(repository_id: uuid.UUID, tool_id: str) -> None:
    from shire.core.db import unit_of_work

    runners = {
        "emerge": "generate_graph",
        "git-of-theseus": "generate_code_age",
        "code-maat": "generate_coupling",
        "codecharta": "generate_code_map",
    }
    with unit_of_work() as session:
        service = AnalysisService(session)
        try:
            if runner := runners.get(tool_id):
                getattr(service, runner)(repository_id)
            else:
                service.run_tool(repository_id, tool_id)
        except AppError:
            # A missing binary or an un-analyzed repo is expected here; the checklist shows
            # the row as still-not-done rather than surfacing a failure the user can't act on.
            return


def _run_freshness_in_background(repository_id: uuid.UUID) -> None:
    from shire.core.db import unit_of_work

    with unit_of_work() as session:
        try:
            AnalysisService(session).generate_dependency_freshness(repository_id)
        except AppError:
            return
