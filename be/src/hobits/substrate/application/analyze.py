"""Application service: run scanners over a clone and assemble an immutable Analysis.

This is the substrate pipeline. It is a plain callable today; in Phase 3 a Prefect flow wraps
this same service for scheduled / event-triggered runs (the orchestration seam).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable

from hobits.substrate.application.ratings import compute_ratings
from hobits.substrate.domain.enrichment import Enrichment
from hobits.substrate.domain.models import Analysis
from hobits.substrate.domain.ports import (
    AnalysisRepository,
    ScanContext,
    ScanContribution,
    Scanner,
)
from hobits.substrate.domain.value_objects import AnalysisStatus, RepositoryFacts


class AnalyzeRepositoryService:
    def __init__(self, analysis_repo: AnalysisRepository, scanners: list[Scanner]) -> None:
        self._analysis_repo = analysis_repo
        self._scanners = scanners

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
        self._analysis_repo.add(analysis)
        return analysis


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
