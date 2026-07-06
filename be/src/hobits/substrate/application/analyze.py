"""Application service: run scanners over a clone and assemble an immutable Analysis.

This is the substrate pipeline. It is a plain callable today; in Phase 3 a Prefect flow wraps
this same service for scheduled / event-triggered runs (the orchestration seam).
"""

from __future__ import annotations

import uuid

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
        )
        self._analysis_repo.add(analysis)
        return analysis


def _merge(contributions) -> ScanContribution:
    """Fold per-scanner contributions into one: scalars take the last non-None; lists concat."""
    acc: dict = {}
    lists: dict[str, list] = {
        "contributors": [],
        "commit_activity": [],
        "languages": [],
        "dependencies": [],
        "cicd": [],
        "hotspots": [],
    }
    scalars = (
        "first_commit_at",
        "last_commit_at",
        "commit_count",
        "loc_total",
        "primary_language",
        "license",
        "has_tests",
    )
    for contribution in contributions:
        for key in lists:
            lists[key].extend(getattr(contribution, key))
        for key in scalars:
            value = getattr(contribution, key)
            if value is not None:
                acc[key] = value
    return ScanContribution(**acc, **lists)
