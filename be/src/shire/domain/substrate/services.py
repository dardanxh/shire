"""Substrate domain service: run scanners, assemble an Analysis, derive ratings, run tools.

This is the substrate pipeline. Route-facing methods return `*Result` schemas; the internal
`analyze()` returns the `Analysis` aggregate because the Repository service reuses it during
ingestion (service-to-service).
"""

from __future__ import annotations

import json
import re
import shutil
import uuid
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.orm import Session

from shire.core.exceptions import ConflictError, NotFoundError
from shire.core.settings import get_settings
from shire.domain.jobs import kinds as job_kinds
from shire.domain.jobs.repositories import SqlJobRepository
from shire.domain.jobs.schemas import JobResult
from shire.domain.jobs.services import JobService
from shire.domain.repository.repositories import SqlRepositoryRepository
from shire.domain.substrate import architecture
from shire.domain.substrate.domain import (
    Analysis,
    AnalysisStatus,
    Ecosystem,
    Enrichment,
    Rating,
    Ratings,
    RepositoryFacts,
    ScanContext,
    ScanContribution,
)
from shire.domain.substrate.repositories import (
    SqlAnalysisRepository,
    SqlRepositoryToolRepository,
)
from shire.domain.substrate.schemas import (
    AnalysisResult,
    ArchitectureDiagram,
    ArchitectureResult,
    CodeAgeCohort,
    CodeAgeResult,
    CodebaseOverviewResult,
    CodeMapResult,
    CouplingPair,
    CouplingResult,
    DependencyFreshnessItem,
    DependencyFreshnessResult,
    DependencyUsageResult,
    GraphResult,
    RepositoryContributorsResult,
    ToolLogResult,
)
from shire.integrations import pypi
from shire.integrations.claude_agent import ClaudeAgent
from shire.integrations.external_tools import tool_languages
from shire.integrations.external_tools.code_maat import CodeMaatAdapter
from shire.integrations.external_tools.codecharta import CodeChartaAdapter
from shire.integrations.external_tools.emerge import EmergeAdapter
from shire.integrations.external_tools.git_of_theseus import GitOfTheseusAdapter
from shire.integrations.git_history import build_scan_context
from shire.integrations.scanners import base_scanners, tool_scanners

# Visualization/artifact tools: their "data" is a generated file tree (not analysis scalars), so
# unlinking clears the artifact directory rather than analysis fields.
_VIZ_TOOLS = {"emerge", "git-of-theseus", "code-maat", "codecharta"}

# Public URL prefixes for statically-served artifacts (static mounts in main.py).
# - emerge graph output:        <graph_root>/<repo_id>/html/emerge.html
# - other viz artifacts:        <artifacts_root>/<tool>/<repo_id>/...
# - CodeCharta browser viewer:  a static SPA that loads a map via ?file=<url>
GRAPH_ARTIFACTS_PATH = "/api/v1/graph-artifacts"
ARTIFACTS_PATH = "/api/v1/artifacts"
CC_VIEWER_PATH = "/api/v1/cc-viewer"

# Enrichment scalar fields owned by each tool (overwritten when that tool runs on demand).
_SCALAR_FIELDS: dict[str, tuple[str, ...]] = {
    "scc": ("code_lines", "complexity_total", "cocomo_cost_usd", "schedule_months"),
    "lizard": ("ccn_average", "ccn_max", "function_count", "high_complexity_count"),
    "radon": ("maintainability_index",),
    "syft": ("sbom_package_count",),
    "gitleaks": ("secret_count",),
    "scorecard": ("health_score",),
    "test-metrics": (
        "test_count",
        "test_file_count",
        "test_to_code_ratio",
        "assertion_density",
        "test_frameworks",
        "test_coverage_pct",
    ),
    "ruff": ("lint_issue_count",),
    "bandit": ("sast_issue_count", "sast_high", "sast_medium", "sast_low"),
    "vulture": ("dead_code_count",),
    "ownership": (
        "bus_factor",
        "top_author_share",
        "active_contributor_count",
        "commits_last_90d",
        "days_since_last_commit",
        "maintenance_status",
    ),
}


class AnalysisService:
    """Business logic for the substrate. Constructed per request from a DB session."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._analyses = SqlAnalysisRepository(session)
        # Cross-domain read (clone path) for on-demand tool runs — tightly coupled to a clone.
        self._repos = SqlRepositoryRepository(session)
        self._links = SqlRepositoryToolRepository(session)
        self._base_scanners = base_scanners()
        self._tool_scanners = tool_scanners()
        self._build_context = build_scan_context

    # --- pipeline (internal; reused by RepositoryService during ingestion) ----
    def analyze(self, repository_id: uuid.UUID, ctx: ScanContext) -> Analysis:
        # Base substrate always runs; integrations run only if linked to this repo. An unconfigured
        # repo (no link rows) is auto-linked from the detected languages on this first analysis.
        base = _merge(scanner.scan(ctx) for scanner in self._base_scanners)
        if self._links.has_any(repository_id):
            linked = self._links.linked_ids(repository_id)
        else:
            linked = _auto_link(base)
            self._links.set_all(repository_id, linked)

        contributions = [base]
        contributions.extend(
            scanner.scan(ctx)
            for tool_id, scanner in self._tool_scanners.items()
            if tool_id in linked
        )
        merged = _merge(contributions)

        facts = RepositoryFacts(
            first_commit_at=merged.first_commit_at,
            last_commit_at=merged.last_commit_at,
            commit_count=merged.commit_count or 0,
            contributor_count=len(merged.contributors),
            loc_total=merged.loc_total or 0,
            primary_language=merged.primary_language,
            license=merged.license or RepositoryFacts().license,
            has_tests=bool(merged.has_tests),
            dependency_count=len(merged.dependencies),
        )
        enrichment = _build_enrichment(merged)

        analysis = Analysis(
            repository_id=repository_id,
            commit_sha=ctx.head_sha,
            status=AnalysisStatus.complete,
            facts=facts,
            contributors=merged.contributors,
            commit_activity=merged.commit_activity,
            languages=merged.languages,
            dependencies=merged.dependencies,
            cicd=merged.cicd,
            hotspots=merged.hotspots,
            enrichment=enrichment,
            vulnerabilities=merged.vulnerabilities,
            health_checks=merged.health_checks,
            tool_runs=merged.tool_runs,
        )
        self._analyses.add(analysis)
        return analysis

    # --- reads ----------------------------------------------------------------
    def latest_result(self, repository_id: uuid.UUID) -> AnalysisResult:
        analysis = self._analyses.get_latest_for_repository(repository_id)
        if analysis is None:
            raise NotFoundError("No completed analysis for this repository")
        return AnalysisResult.of(analysis)

    def delete_for_repository(self, repository_id: uuid.UUID) -> None:
        """Purge a repository's substrate: analysis snapshots (child rows cascade) and every
        generated on-disk artifact (codebase graph + visualization outputs)."""
        self._analyses.delete_for_repository(repository_id)
        self.clear_artifacts(repository_id)

    def clear_artifacts(self, repository_id: uuid.UUID) -> None:
        """Remove every generated on-disk artifact (codebase graph + all artifacts_root dirs:
        architecture, codebase-overview, dependency-freshness, code-age, coupling, code-map).
        Used on delete and on branch switch — artifacts describe the previously checked-out
        branch. Analysis snapshots are kept (keyed by commit, re-added idempotently)."""
        settings = get_settings()
        shutil.rmtree(settings.graph_root / str(repository_id), ignore_errors=True)
        if settings.artifacts_root.exists():
            for tool_dir in settings.artifacts_root.iterdir():
                shutil.rmtree(tool_dir / str(repository_id), ignore_errors=True)

    def tool_log(self, repository_id: uuid.UUID, tool_name: str) -> ToolLogResult:
        """Raw findings log for a tool's latest run — None when it hasn't run or produced none."""
        analysis = self._analyses.get_latest_for_repository(repository_id)
        run = (
            next((t for t in analysis.tool_runs if t.name == tool_name), None)
            if analysis
            else None
        )
        log = run.log if run else None
        return ToolLogResult(
            tool=tool_name, log=log, line_count=len(log.splitlines()) if log else 0
        )

    def contributors_across_repositories(self) -> list[RepositoryContributorsResult]:
        """Every repository's contributors from its latest complete analysis (fleet-wide read).

        The contributors bounded context calls this (service-to-service) to aggregate people
        across all repositories, keeping the substrate's persistence private to this domain.
        """
        results: list[RepositoryContributorsResult] = []
        for repo in self._repos.list():
            analysis = self._analyses.get_latest_for_repository(repo.id)
            if analysis is None:
                continue
            results.append(
                RepositoryContributorsResult(
                    repository_id=repo.id,
                    repository_name=f"{repo.coordinates.owner}/{repo.coordinates.name}",
                    contributors=analysis.contributors,
                )
            )
        return results

    def dependency_usage(self, name: str) -> list[DependencyUsageResult]:
        grouped: dict[uuid.UUID, set[str]] = {}
        for repo_id, version in self._analyses.dependency_usage(name):
            versions = grouped.setdefault(repo_id, set())
            if version:
                versions.add(version)
        return [
            DependencyUsageResult(repository_id=rid, versions=sorted(vers))
            for rid, vers in grouped.items()
        ]

    # --- per-repo integration links -------------------------------------------
    def linked_integrations(self, repository_id: uuid.UUID) -> list[str]:
        return sorted(self._links.linked_ids(repository_id))

    def set_integrations(self, repository_id: uuid.UUID, tool_ids: set[str]) -> None:
        """Pin the repo's linked tools (used at ingest to bypass the language auto-link)."""
        self._links.set_all(repository_id, {t for t in tool_ids if t in tool_languages()})

    def link_integration(self, repository_id: uuid.UUID, tool_id: str) -> list[str]:
        if tool_id not in tool_languages():
            raise NotFoundError(f"Unknown tool: {tool_id}")
        self._links.add(repository_id, tool_id)
        return self.linked_integrations(repository_id)

    def unlink_integration(self, repository_id: uuid.UUID, tool_id: str) -> list[str]:
        self._links.remove(repository_id, tool_id)
        self._clear_tool_data(repository_id, tool_id)
        return self.linked_integrations(repository_id)

    def _clear_tool_data(self, repository_id: uuid.UUID, tool_id: str) -> None:
        """On unlink, remove the tool's contribution: its artifact (viz) or its analysis data."""
        if tool_id in _VIZ_TOOLS:
            target = (
                get_settings().graph_root / str(repository_id)
                if tool_id == "emerge"
                else self._artifact_dir(tool_id, repository_id)
            )
            shutil.rmtree(target, ignore_errors=True)
            return

        analysis = self._analyses.get_latest_for_repository(repository_id)
        if analysis is None:
            return
        updates: dict = dict.fromkeys(_SCALAR_FIELDS.get(tool_id, ()))
        if tool_id == "gitleaks":
            updates["secret_count"] = 0  # non-nullable count column
        if tool_id == "osv-scanner":
            analysis.vulnerabilities = []
            updates.update(
                vulnerability_count=0, vuln_critical=0, vuln_high=0, vuln_moderate=0, vuln_low=0
            )
        if tool_id == "scorecard":
            analysis.health_checks = []
        enrichment = analysis.enrichment.model_copy(update=updates)
        security_ran = any(
            t.name == "osv-scanner" and t.contributed
            for t in analysis.tool_runs
            if t.name != tool_id
        )
        ratings = compute_ratings(
            enrichment, security_ran=security_ran, health_ran=enrichment.health_score is not None
        )
        analysis.enrichment = enrichment.model_copy(update={"ratings": ratings})
        analysis.tool_runs = [t for t in analysis.tool_runs if t.name != tool_id]
        self._analyses.add(analysis)

    # --- on-demand single tool run --------------------------------------------
    def run_tool(self, repository_id: uuid.UUID, tool_name: str) -> AnalysisResult:
        scanner = self._tool_scanners.get(tool_name)
        if scanner is None:
            raise NotFoundError(f"Unknown tool: {tool_name}")
        if tool_name not in self._links.linked_ids(repository_id):
            raise ConflictError(f"Integration '{tool_name}' is not linked to this repository.")
        repo = self._repos.get(repository_id)
        if repo is None or not repo.clone_path:
            raise ConflictError("Repository has not been cloned.")
        analysis = self._analyses.get_latest_for_repository(repository_id)
        if analysis is None:
            raise ConflictError("Run a full analysis before running a single tool.")

        from pathlib import Path

        ctx = self._build_context(Path(repo.clone_path), analysis.commit_sha, repo.url.value)
        _apply_tool(analysis, tool_name, scanner.scan(ctx))
        self._analyses.add(analysis)  # idempotent replace by (repository, commit)
        return AnalysisResult.of(analysis)

    # --- codebase graph (emerge artifact) -------------------------------------
    def graph_status(self, repository_id: uuid.UUID) -> GraphResult:
        """Report whether a graph artifact exists for the repository, and where to view it."""
        out_dir = get_settings().graph_root / str(repository_id)
        entry = out_dir / EmergeAdapter.HTML_ENTRY
        available = EmergeAdapter().is_available()
        if not entry.is_file():
            return GraphResult(
                repository_id=repository_id, generated=False, tool_available=available
            )
        stats = EmergeAdapter.read_stats(out_dir)
        return GraphResult(
            repository_id=repository_id,
            generated=True,
            url=f"{GRAPH_ARTIFACTS_PATH}/{repository_id}/{EmergeAdapter.HTML_ENTRY}",
            generated_at=datetime.fromtimestamp(entry.stat().st_mtime, tz=UTC),
            scanned_files=stats.get("scanned_files"),
            node_count=stats.get("node_count"),
            tool_available=available,
        )

    def generate_graph(self, repository_id: uuid.UUID) -> GraphResult:
        """Run emerge against the current clone and (re)generate the interactive graph."""
        emerge = EmergeAdapter()
        if not emerge.is_available():
            raise ConflictError(
                "emerge is not installed on the server. Install it with: "
                "uv tool install emerge-viz --with 'setuptools<81' --with pip"
            )
        repo = self._repos.get(repository_id)
        if repo is None or not repo.clone_path:
            raise ConflictError("Repository has not been cloned.")

        out_dir = get_settings().graph_root / str(repository_id)
        # Clear any prior run so a failure can't leave a stale graph looking current.
        shutil.rmtree(out_dir, ignore_errors=True)
        project_name = Path(repo.clone_path).name or str(repository_id)
        if emerge.run(Path(repo.clone_path), out_dir, project_name) is None:
            raise ConflictError("Graph generation failed — emerge produced no output.")
        return self.graph_status(repository_id)

    # --- code age (git-of-theseus) --------------------------------------------
    def code_age_status(self, repository_id: uuid.UUID) -> CodeAgeResult:
        out_dir = self._artifact_dir("git-of-theseus", repository_id)
        svg = out_dir / GitOfTheseusAdapter.SVG_NAME
        available = GitOfTheseusAdapter().is_available()
        if not svg.is_file():
            return CodeAgeResult(
                repository_id=repository_id, generated=False, tool_available=available
            )
        cohorts = [CodeAgeCohort(**c) for c in GitOfTheseusAdapter.read_cohorts(out_dir)]
        return CodeAgeResult(
            repository_id=repository_id,
            generated=True,
            url=f"{ARTIFACTS_PATH}/git-of-theseus/{repository_id}/{GitOfTheseusAdapter.SVG_NAME}",
            generated_at=_mtime(svg),
            cohorts=cohorts,
            tool_available=available,
        )

    def generate_code_age(self, repository_id: uuid.UUID) -> CodeAgeResult:
        adapter = GitOfTheseusAdapter()
        if not adapter.is_available():
            raise ConflictError(
                "git-of-theseus is not installed. Install it with: uv tool install git-of-theseus"
            )
        repo = self._require_cloned_repo(repository_id)
        out_dir = self._artifact_dir("git-of-theseus", repository_id)
        shutil.rmtree(out_dir, ignore_errors=True)
        branch = repo.current_branch or repo.default_branch
        if adapter.run(Path(repo.clone_path), out_dir, branch) is None:
            raise ConflictError("Code-age generation failed — git-of-theseus produced no output.")
        return self.code_age_status(repository_id)

    # --- temporal coupling (code-maat) ----------------------------------------
    def coupling_status(self, repository_id: uuid.UUID) -> CouplingResult:
        cache = self._artifact_dir("code-maat", repository_id) / "coupling.json"
        available = CodeMaatAdapter().is_available()
        if not cache.is_file():
            return CouplingResult(
                repository_id=repository_id, generated=False, tool_available=available
            )
        try:
            pairs = [CouplingPair(**p) for p in json.loads(cache.read_text())]
        except (OSError, json.JSONDecodeError, ValueError, TypeError):
            pairs = []
        return CouplingResult(
            repository_id=repository_id,
            generated=True,
            generated_at=_mtime(cache),
            pairs=pairs,
            tool_available=available,
        )

    def generate_coupling(self, repository_id: uuid.UUID) -> CouplingResult:
        adapter = CodeMaatAdapter()
        if not adapter.is_available():
            raise ConflictError(
                "code-maat is not installed. Download its standalone jar into "
                "~/.local/share/code-maat/ (requires java)."
            )
        repo = self._require_cloned_repo(repository_id)
        out_dir = self._artifact_dir("code-maat", repository_id)
        shutil.rmtree(out_dir, ignore_errors=True)
        rows = adapter.run(Path(repo.clone_path), out_dir)
        if rows is None:
            raise ConflictError("Coupling analysis failed — code-maat produced no output.")
        (out_dir / "coupling.json").write_text(json.dumps(rows))
        return self.coupling_status(repository_id)

    # --- dependency freshness (PyPI latest vs. declared) ----------------------
    def dependency_freshness_status(
        self, repository_id: uuid.UUID
    ) -> DependencyFreshnessResult:
        """The cached freshness check, if one has been run."""
        cache = self._artifact_dir("dependency-freshness", repository_id) / "freshness.json"
        gains_job = SqlJobRepository(self._session).latest_unsettled(
            job_kinds.SUBSTRATE_DEPENDENCY_GAINS, repository_id
        )
        if not cache.is_file():
            return DependencyFreshnessResult(
                repository_id=repository_id,
                generated=False,
                gains_pending=gains_job is not None,
                gains_job_id=gains_job.id if gains_job else None,
            )
        try:
            items = [DependencyFreshnessItem(**i) for i in json.loads(cache.read_text())]
        except (OSError, json.JSONDecodeError, ValueError, TypeError):
            items = []
        return DependencyFreshnessResult(
            repository_id=repository_id,
            generated=True,
            generated_at=_mtime(cache),
            items=items,
            gains_pending=gains_job is not None,
            gains_job_id=gains_job.id if gains_job else None,
        )

    def generate_dependency_freshness(
        self, repository_id: uuid.UUID
    ) -> DependencyFreshnessResult:
        """Fetch each pip dependency's latest version from PyPI, compute the gap, and (if the agent
        is available) summarize what upgrading gets you. Cached to disk."""
        analysis = self.latest_result(repository_id)  # raises if the repo has no analysis
        pip_names = sorted(
            {d.name for d in analysis.dependencies if d.ecosystem == Ecosystem.pip}
        )
        latest_map = pypi.latest_many(pip_names)

        items: list[DependencyFreshnessItem] = []
        for dep in analysis.dependencies:
            if dep.ecosystem != Ecosystem.pip:
                items.append(
                    DependencyFreshnessItem(
                        name=dep.name, ecosystem=dep.ecosystem.value, current=dep.version,
                        latest=None, latest_released_at=None, gap="unknown",
                    )
                )
                continue
            found = latest_map.get(dep.name)
            latest_v, released, url = found if found else (None, None, None)
            base = pypi.base_version(dep.version)
            items.append(
                DependencyFreshnessItem(
                    name=dep.name, ecosystem=dep.ecosystem.value, current=dep.version,
                    latest=latest_v, latest_released_at=released, latest_url=url,
                    gap=pypi.compute_gap(base, latest_v),
                )
            )

        out_dir = self._artifact_dir("dependency-freshness", repository_id)
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "freshness.json").write_text(
            json.dumps([i.model_dump() for i in items])
        )

        # The deterministic columns are ready now; the per-package "what you gain" lines are an
        # engine job — the handler in jobs.py fills them into the cached file when it settles.
        outdated = [i for i in items if i.gap in ("patch", "minor", "major")]
        repo = self._repos.get(repository_id)
        if outdated and repo and repo.clone_path:
            jobs = JobService(self._session)
            model, timeout_seconds = jobs.engine_defaults()
            jobs.enqueue(
                kind=job_kinds.SUBSTRATE_DEPENDENCY_GAINS,
                title=f"Dependency upgrade gains — {repo.coordinates.slug}",
                prompt=_gains_prompt(outdated),
                payload={
                    "cwd": repo.clone_path,
                    "model": model,
                    "timeout_seconds": timeout_seconds,
                    "repository_id": str(repository_id),
                    "branch": repo.current_branch or repo.default_branch,
                },
                repository_id=repository_id,
            )
        return self.dependency_freshness_status(repository_id)

    # --- architecture diagrams (Mermaid via claude -p) ------------------------
    def architecture_status(self, repository_id: uuid.UUID) -> ArchitectureResult:
        """The diagram catalog, with any previously generated Mermaid filled in from disk cache."""
        out_dir = self._artifact_dir("architecture", repository_id)
        diagrams: list[ArchitectureDiagram] = []
        for kind in architecture.CATALOG:
            entry = ArchitectureDiagram(
                kind=kind.slug,
                title=kind.title,
                description=kind.description,
                category=kind.category,
                mermaid_type=kind.mermaid_type,
            )
            cache = out_dir / f"{kind.slug}.json"
            if cache.is_file():
                try:
                    mermaid = json.loads(cache.read_text()).get("mermaid")
                except (OSError, json.JSONDecodeError, ValueError, TypeError):
                    mermaid = None
                if mermaid:
                    entry.mermaid = str(mermaid)
                    entry.generated = True
                    entry.generated_at = _mtime(cache)
            diagrams.append(entry)
        return ArchitectureResult(
            repository_id=repository_id,
            diagrams=diagrams,
            agent_available=_new_agent().available(),
        )

    def enqueue_architecture_diagram(
        self, repository_id: uuid.UUID, kind_slug: str
    ) -> JobResult:
        """Enqueue one Mermaid diagram generation for the engine service (non-blocking).
        The handler in jobs.py writes the artifact when the job settles."""
        kind = architecture.CATALOG_BY_SLUG.get(kind_slug)
        if kind is None:
            raise NotFoundError(f"Unknown architecture diagram: {kind_slug}")
        repo = self._require_cloned_repo(repository_id)
        jobs = JobService(self._session)
        model, timeout_seconds = jobs.engine_defaults()
        job = jobs.enqueue(
            kind=job_kinds.SUBSTRATE_ARCHITECTURE,
            title=f"Architecture diagram: {kind.title} — {repo.coordinates.slug}",
            prompt=architecture.build_prompt(kind, repo.coordinates.slug),
            payload={
                "cwd": repo.clone_path,
                "model": model,
                "timeout_seconds": timeout_seconds,
                "repository_id": str(repository_id),
                "kind": kind.slug,
                "branch": repo.current_branch or repo.default_branch,
            },
            repository_id=repository_id,
        )
        return JobResult.of(job)

    # --- codebase overview (big-picture summary via claude -p) ----------------
    def codebase_overview_status(self, repository_id: uuid.UUID) -> CodebaseOverviewResult:
        """The cached big-picture overview, if one has been generated."""
        cache = self._artifact_dir("codebase-overview", repository_id) / "overview.json"
        if not cache.is_file():
            return CodebaseOverviewResult(
                repository_id=repository_id,
                generated=False,
                agent_available=_new_agent().available(),
            )
        try:
            data = json.loads(cache.read_text())
        except (OSError, json.JSONDecodeError, ValueError):
            data = {}
        return CodebaseOverviewResult(
            repository_id=repository_id,
            generated=True,
            generated_at=_mtime(cache),
            agent_available=True,
            summary=data.get("summary"),
            kind=data.get("kind"),
            domain=data.get("domain"),
            problem=data.get("problem"),
            features=data.get("features") or [],
            audience=data.get("audience"),
        )

    def enqueue_codebase_overview(self, repository_id: uuid.UUID) -> JobResult:
        """Enqueue the big-picture overview generation for the engine service (non-blocking)."""
        repo = self._require_cloned_repo(repository_id)
        jobs = JobService(self._session)
        model, timeout_seconds = jobs.engine_defaults()
        job = jobs.enqueue(
            kind=job_kinds.SUBSTRATE_CODEBASE_OVERVIEW,
            title=f"Codebase overview — {repo.coordinates.slug}",
            prompt=_OVERVIEW_PROMPT.format(repo=repo.coordinates.slug),
            payload={
                "cwd": repo.clone_path,
                "model": model,
                "timeout_seconds": timeout_seconds,
                "repository_id": str(repository_id),
                "branch": repo.current_branch or repo.default_branch,
            },
            repository_id=repository_id,
        )
        return JobResult.of(job)

    # --- code city (CodeCharta) -----------------------------------------------
    def code_map_status(self, repository_id: uuid.UUID) -> CodeMapResult:
        adapter = CodeChartaAdapter()
        out_dir = self._artifact_dir("codecharta", repository_id)
        map_path = out_dir / CodeChartaAdapter.MAP_NAME
        available = adapter.is_available()
        viewer = adapter.viewer_available()
        if not map_path.is_file():
            return CodeMapResult(
                repository_id=repository_id,
                generated=False,
                tool_available=available,
                viewer_available=viewer,
            )
        map_url = f"{ARTIFACTS_PATH}/codecharta/{repository_id}/{CodeChartaAdapter.MAP_NAME}"
        return CodeMapResult(
            repository_id=repository_id,
            generated=True,
            url=f"{CC_VIEWER_PATH}/index.html?file={map_url}" if viewer else None,
            generated_at=_mtime(map_path),
            file_count=CodeChartaAdapter.file_count(map_path),
            tool_available=available,
            viewer_available=viewer,
        )

    def generate_code_map(self, repository_id: uuid.UUID) -> CodeMapResult:
        adapter = CodeChartaAdapter()
        if not adapter.is_available():
            raise ConflictError(
                "CodeCharta (ccsh) is not installed. Install it with: "
                "npm install -g codecharta-analysis codecharta-visualization"
            )
        repo = self._require_cloned_repo(repository_id)
        out_dir = self._artifact_dir("codecharta", repository_id)
        shutil.rmtree(out_dir, ignore_errors=True)
        if adapter.run(Path(repo.clone_path), out_dir) is None:
            raise ConflictError("Code-map generation failed — CodeCharta produced no output.")
        return self.code_map_status(repository_id)

    # --- shared helpers for visualization artifacts ---------------------------
    def _artifact_dir(self, tool: str, repository_id: uuid.UUID) -> Path:
        return get_settings().artifacts_root / tool / str(repository_id)

    def _require_cloned_repo(self, repository_id: uuid.UUID):
        repo = self._repos.get(repository_id)
        if repo is None or not repo.clone_path:
            raise ConflictError("Repository has not been cloned.")
        return repo


# --- helpers ------------------------------------------------------------------


def _mtime(path: Path) -> datetime:
    return datetime.fromtimestamp(path.stat().st_mtime, tz=UTC)


def _new_agent() -> ClaudeAgent:
    """A ClaudeAgent configured from settings (read-only tools; subscription auth unless
    SHIRE_USE_API_KEY opts into API-key auth)."""
    settings = get_settings()
    return ClaudeAgent(
        binary=settings.claude_binary,
        model=settings.claude_model,
        timeout_seconds=settings.claude_timeout_seconds,
        use_api_key=settings.use_api_key,
    )


def _extract_mermaid_block(text: str) -> str | None:
    """Pull the Mermaid diagram out of the agent's text — the last ```mermaid fence, else a bare
    diagram that starts with a known Mermaid keyword."""
    marker = text.rfind("```mermaid")
    if marker != -1:
        after = text.find("\n", marker)
        close = text.find("```", after + 1) if after != -1 else -1
        if after != -1 and close > after:
            block = text[after:close].strip()
            return block or None
    # No fence — accept a raw diagram if the text itself looks like Mermaid.
    stripped = text.strip()
    keywords = (
        "flowchart", "graph", "sequenceDiagram", "stateDiagram", "erDiagram",
        "classDiagram", "journey", "gantt", "C4Context",
    )
    if stripped.startswith(keywords):
        return stripped
    return None


_OVERVIEW_PROMPT = """\
You are investigating the repository **{repo}** to write a crisp, big-picture overview for someone \
seeing it for the first time. Explore the real code — the README, entrypoints, package manifests \
and the main modules — with your Read, Grep and Glob tools before you conclude anything.

Write a BIG-PICTURE overview only — no file-by-file walkthrough, no setup steps, no code. Base \
every claim on what the code actually is. Answer, concisely:
- What is this, in a single sentence?
- What KIND of software is it (a library, a backend/API service, a CLI tool, a data pipeline / \
orchestration system, an ML/AI system, a frontend app, an infra/DevOps tool, an SDK, ...)?
- What DOMAIN does it serve (e.g. data engineering, web/SaaS, machine learning, fintech, devops, \
general-purpose developer tooling, ...)?
- WHY does it exist — what problem does it solve?
- Its MAIN business-logic capabilities/features (the handful that matter, not every function).
- WHO is it for?

Return ONLY a single fenced json object as the very last thing, nothing else:
```json
{{
  "summary": "one sentence: what it is",
  "kind": "e.g. Backend service",
  "domain": "e.g. Data engineering",
  "problem": "2-4 sentences: why it exists and what problems it solves",
  "features": ["key capability", "another key capability"],
  "audience": "who uses it"
}}
```"""


def _parse_overview(text: str) -> dict | None:
    """Parse the agent's fenced json overview into a clean dict, or None if unusable."""
    block = _extract_json_object(text)
    if block is None:
        return None
    try:
        data = json.loads(block)
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(data, dict) or not data.get("summary"):
        return None
    features = data.get("features")
    return {
        "summary": str(data["summary"]),
        "kind": str(data["kind"]) if data.get("kind") else None,
        "domain": str(data["domain"]) if data.get("domain") else None,
        "problem": str(data["problem"]) if data.get("problem") else None,
        "features": [str(f) for f in features] if isinstance(features, list) else [],
        "audience": str(data["audience"]) if data.get("audience") else None,
    }


def _gains_prompt(outdated: list[DependencyFreshnessItem]) -> str:
    """The one-call prompt: {package: one-line 'what you gain by upgrading'} as fenced json."""
    listing = "\n".join(
        f"- {i.name}: {i.current} -> {i.latest} ({i.gap})" for i in outdated
    )
    return (
        "These Python packages are behind their latest release. For each, give ONE concise line on "
        "the most notable reasons to upgrade to the latest version (key fixes, features, security, "
        "performance) from your knowledge. Be specific but brief; if unsure, say 'general fixes "
        "and improvements'.\n\n"
        f"{listing}\n\n"
        "Return ONLY a single fenced json object mapping each package name to its one-line gain, "
        "nothing else:\n"
        '```json\n{"requests": "...", "pandas": "..."}\n```'
    )


def parse_gains(text: str) -> dict[str, str]:
    """Parse the gains job's result. Empty on any failure (the deterministic columns stand)."""
    block = _extract_json_object(text)
    if block is None:
        return {}
    try:
        data = json.loads(block)
    except (json.JSONDecodeError, ValueError):
        return {}
    return {str(k): str(v) for k, v in data.items()} if isinstance(data, dict) else {}


def _extract_json_object(text: str) -> str | None:
    """Pull the final fenced ```json {...}``` object out of the agent's text (else a bare {...})."""
    marker = text.rfind("```json")
    if marker != -1:
        after = text.find("\n", marker)
        close = text.rfind("```")
        if after != -1 and close > after:
            return text[after:close].strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    return match.group(0) if match else None


def _merge(contributions: Iterable[ScanContribution]) -> ScanContribution:
    """Fold per-scanner contributions: list fields concatenate; scalars take the last non-None."""
    scalars: dict = {}
    lists: dict[str, list] = {}
    for contribution in contributions:
        for name in ScanContribution.model_fields:
            value = getattr(contribution, name)
            if isinstance(value, list):
                lists.setdefault(name, []).extend(value)
            elif value is not None:
                scalars[name] = value
    return ScanContribution(**scalars, **lists)


def _auto_link(base: ScanContribution) -> set[str]:
    """Integrations to link on a repo's first analysis: every general tool, plus language-specific
    tools only when that language is present (e.g. Python tools only for repos with Python)."""
    repo_languages = {stat.language.lower() for stat in base.languages}
    return {
        tool_id
        for tool_id, language in tool_languages().items()
        if language == "general" or language.lower() in repo_languages
    }


def _build_enrichment(merged: ScanContribution) -> Enrichment:
    vulns = merged.vulnerabilities

    def count(sev: str) -> int:
        return sum(1 for v in vulns if v.severity == sev)

    enrichment = Enrichment(
        code_lines=merged.code_lines,
        complexity_total=merged.complexity_total,
        cocomo_cost_usd=merged.cocomo_cost_usd,
        schedule_months=merged.schedule_months,
        ccn_average=merged.ccn_average,
        ccn_max=merged.ccn_max,
        function_count=merged.function_count,
        high_complexity_count=merged.high_complexity_count,
        maintainability_index=merged.maintainability_index,
        sbom_package_count=merged.sbom_package_count,
        vulnerability_count=len(vulns),
        vuln_critical=count("CRITICAL"),
        vuln_high=count("HIGH"),
        vuln_moderate=count("MODERATE"),
        vuln_low=count("LOW"),
        secret_count=merged.secret_count or 0,
        health_score=merged.health_score,
        test_count=merged.test_count,
        test_file_count=merged.test_file_count,
        test_to_code_ratio=merged.test_to_code_ratio,
        assertion_density=merged.assertion_density,
        test_frameworks=merged.test_frameworks,
        test_coverage_pct=merged.test_coverage_pct,
        lint_issue_count=merged.lint_issue_count,
        sast_issue_count=merged.sast_issue_count,
        sast_high=merged.sast_high,
        sast_medium=merged.sast_medium,
        sast_low=merged.sast_low,
        dead_code_count=merged.dead_code_count,
        bus_factor=merged.bus_factor,
        top_author_share=merged.top_author_share,
        active_contributor_count=merged.active_contributor_count,
        commits_last_90d=merged.commits_last_90d,
        days_since_last_commit=merged.days_since_last_commit,
        maintenance_status=merged.maintenance_status,
    )
    security_ran = any(t.name == "osv-scanner" and t.contributed for t in merged.tool_runs)
    health_ran = merged.health_score is not None
    ratings = compute_ratings(enrichment, security_ran=security_ran, health_ran=health_ran)
    return enrichment.model_copy(update={"ratings": ratings})


def _apply_tool(analysis: Analysis, tool_name: str, contribution: ScanContribution) -> None:
    updates: dict = {
        field: getattr(contribution, field) for field in _SCALAR_FIELDS.get(tool_name, ())
    }

    if tool_name == "osv-scanner":
        analysis.vulnerabilities = contribution.vulnerabilities
        updates["vulnerability_count"] = len(contribution.vulnerabilities)
        for sev in ("critical", "high", "moderate", "low"):
            updates[f"vuln_{sev}"] = sum(
                1 for v in contribution.vulnerabilities if v.severity == sev.upper()
            )
    if tool_name == "scorecard":
        analysis.health_checks = contribution.health_checks

    enrichment = analysis.enrichment.model_copy(update=updates)
    security_ran = _security_ran(analysis, tool_name, contribution)
    ratings = compute_ratings(
        enrichment, security_ran=security_ran, health_ran=enrichment.health_score is not None
    )
    analysis.enrichment = enrichment.model_copy(update={"ratings": ratings})

    if contribution.tool_runs:
        run = contribution.tool_runs[0]
        analysis.tool_runs = [t for t in analysis.tool_runs if t.name != run.name] + [run]


def _security_ran(analysis: Analysis, tool_name: str, contribution: ScanContribution) -> bool:
    if tool_name == "osv-scanner":
        return bool(contribution.tool_runs and contribution.tool_runs[0].contributed)
    return any(t.name == "osv-scanner" and t.contributed for t in analysis.tool_runs)


# --- ratings ------------------------------------------------------------------


def compute_ratings(e: Enrichment, *, security_ran: bool, health_ran: bool) -> Ratings:
    return Ratings(
        maintainability=_maintainability(e),
        security=_security(e) if security_ran else Rating.na,
        health=_health(e) if health_ran else Rating.na,
    )


def _maintainability(e: Enrichment) -> Rating:
    # Prefer radon's Maintainability Index (0-100, higher = better); else fall back to complexity.
    if e.maintainability_index is not None:
        mi = e.maintainability_index
        if mi >= 85:
            return Rating.a
        if mi >= 70:
            return Rating.b
        if mi >= 55:
            return Rating.c
        if mi >= 40:
            return Rating.d
        return Rating.e
    if e.ccn_average is not None:
        ccn = e.ccn_average
        if ccn <= 5:
            return Rating.a
        if ccn <= 10:
            return Rating.b
        if ccn <= 20:
            return Rating.c
        if ccn <= 40:
            return Rating.d
        return Rating.e
    return Rating.na


def _security(e: Enrichment) -> Rating:
    if e.secret_count > 0 or e.vuln_critical > 0:
        return Rating.e
    if e.vuln_high > 0:
        return Rating.d
    if e.vuln_moderate > 0:
        return Rating.c
    if e.vuln_low > 0:
        return Rating.b
    return Rating.a


def _health(e: Enrichment) -> Rating:
    if e.health_score is None or e.health_score < 0:
        return Rating.na
    score = e.health_score
    if score >= 8:
        return Rating.a
    if score >= 6:
        return Rating.b
    if score >= 4:
        return Rating.c
    if score >= 2:
        return Rating.d
    return Rating.e
