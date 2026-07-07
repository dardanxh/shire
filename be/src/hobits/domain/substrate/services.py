"""Substrate domain service: run scanners, assemble an Analysis, derive ratings, run tools.

This is the substrate pipeline. Route-facing methods return `*Result` schemas; the internal
`analyze()` returns the `Analysis` aggregate because the Repository service reuses it during
ingestion (service-to-service).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable

from sqlalchemy.orm import Session

from hobits.core.exceptions import ConflictError, NotFoundError
from hobits.domain.repository.repositories import SqlRepositoryRepository
from hobits.domain.substrate.domain import (
    Analysis,
    AnalysisStatus,
    Enrichment,
    Rating,
    Ratings,
    RepositoryFacts,
    ScanContext,
    ScanContribution,
)
from hobits.domain.substrate.repositories import SqlAnalysisRepository
from hobits.domain.substrate.schemas import (
    AnalysisResult,
    DependencyUsageResult,
    ToolStatusResult,
)
from hobits.integrations.external_tools import all_tool_statuses
from hobits.integrations.git_history import build_scan_context
from hobits.integrations.scanners import default_scanners, tool_scanners

# Enrichment scalar fields owned by each tool (overwritten when that tool runs on demand).
_SCALAR_FIELDS: dict[str, tuple[str, ...]] = {
    "scc": ("code_lines", "complexity_total", "cocomo_cost_usd", "schedule_months"),
    "lizard": ("ccn_average", "ccn_max", "function_count", "high_complexity_count"),
    "radon": ("maintainability_index",),
    "syft": ("sbom_package_count",),
    "gitleaks": ("secret_count",),
    "scorecard": ("health_score",),
}


class AnalysisService:
    """Business logic for the substrate. Constructed per request from a DB session."""

    def __init__(self, session: Session) -> None:
        self._analyses = SqlAnalysisRepository(session)
        # Cross-domain read (clone path) for on-demand tool runs — tightly coupled to a clone.
        self._repos = SqlRepositoryRepository(session)
        self._scanners = default_scanners()
        self._tool_scanners = tool_scanners()
        self._build_context = build_scan_context

    # --- pipeline (internal; reused by RepositoryService during ingestion) ----
    def analyze(self, repository_id: uuid.UUID, ctx: ScanContext) -> Analysis:
        merged = _merge(scanner.scan(ctx) for scanner in self._scanners)

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

    def tool_statuses(self) -> list[ToolStatusResult]:
        return [ToolStatusResult.of(status) for status in all_tool_statuses()]

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

    # --- on-demand single tool run --------------------------------------------
    def run_tool(self, repository_id: uuid.UUID, tool_name: str) -> AnalysisResult:
        scanner = self._tool_scanners.get(tool_name)
        if scanner is None:
            raise NotFoundError(f"Unknown tool: {tool_name}")
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


# --- pipeline helpers ---------------------------------------------------------


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
