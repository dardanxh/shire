"""Application service: run a single external tool on demand against a repo's current clone.

Merges just that tool's fresh result into the latest analysis snapshot and recomputes ratings.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from pathlib import Path

from hobits.repository.domain.ports import RepositoryRepository
from hobits.substrate.application.ratings import compute_ratings
from hobits.substrate.domain.models import Analysis
from hobits.substrate.domain.ports import AnalysisRepository, ScanContext, ScanContribution
from hobits.substrate.infrastructure.scanners import tool_scanners

ScanContextBuilder = Callable[[Path, str, str | None], ScanContext]

# Enrichment scalar fields owned by each tool (overwritten when that tool runs).
_SCALAR_FIELDS: dict[str, tuple[str, ...]] = {
    "scc": ("code_lines", "complexity_total", "cocomo_cost_usd", "schedule_months"),
    "lizard": ("ccn_average", "ccn_max", "function_count", "high_complexity_count"),
    "radon": ("maintainability_index",),
    "syft": ("sbom_package_count",),
    "gitleaks": ("secret_count",),
    "scorecard": ("health_score",),
}


class ToolNotFoundError(ValueError):
    pass


class RepositoryNotReadyError(RuntimeError):
    pass


class RunToolService:
    def __init__(
        self,
        repo_repo: RepositoryRepository,
        analysis_repo: AnalysisRepository,
        context_builder: ScanContextBuilder,
    ) -> None:
        self._repos = repo_repo
        self._analyses = analysis_repo
        self._build_context = context_builder
        self._scanners = tool_scanners()

    def run(self, repository_id: uuid.UUID, tool_name: str) -> Analysis:
        scanner = self._scanners.get(tool_name)
        if scanner is None:
            raise ToolNotFoundError(f"Unknown tool: {tool_name}")
        repo = self._repos.get(repository_id)
        if repo is None or not repo.clone_path:
            raise RepositoryNotReadyError("Repository has not been cloned.")
        analysis = self._analyses.get_latest_for_repository(repository_id)
        if analysis is None:
            raise RepositoryNotReadyError("Run a full analysis before running a single tool.")

        ctx = self._build_context(Path(repo.clone_path), analysis.commit_sha, repo.url.value)
        _apply(analysis, tool_name, scanner.scan(ctx))
        self._analyses.add(analysis)  # idempotent replace by (repository, commit)
        return analysis


def _apply(analysis: Analysis, tool_name: str, contribution: ScanContribution) -> None:
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
