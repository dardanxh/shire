"""HTTP API for the Substrate bounded context (analysis snapshots + cross-repo queries)."""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from hobits.shared.infrastructure.db import get_session
from hobits.substrate.domain.enrichment import (
    Enrichment,
    HealthCheck,
    ToolRun,
    Vulnerability,
)
from hobits.substrate.domain.models import Analysis, Contributor
from hobits.substrate.domain.value_objects import (
    CiCdConfig,
    DailyCommitCount,
    Dependency,
    Hotspot,
    LanguageStat,
)
from hobits.substrate.infrastructure.external_tools import all_tool_statuses
from hobits.substrate.infrastructure.persistence import SqlAnalysisRepository

router = APIRouter(tags=["substrate"])


class FactsOut(BaseModel):
    first_commit_at: datetime | None
    last_commit_at: datetime | None
    age_days: int | None
    commit_count: int
    contributor_count: int
    loc_total: int
    primary_language: str | None
    license_spdx: str | None
    license_name: str | None
    has_tests: bool
    dependency_count: int


class AnalysisOut(BaseModel):
    id: uuid.UUID
    repository_id: uuid.UUID
    commit_sha: str
    analyzed_at: datetime
    facts: FactsOut
    contributors: list[Contributor]
    commit_activity: list[DailyCommitCount]
    languages: list[LanguageStat]
    dependencies: list[Dependency]
    cicd: list[CiCdConfig]
    hotspots: list[Hotspot]
    enrichment: Enrichment
    vulnerabilities: list[Vulnerability]
    health_checks: list[HealthCheck]
    tool_runs: list[ToolRun]

    @classmethod
    def of(cls, analysis: Analysis) -> AnalysisOut:
        f = analysis.facts
        return cls(
            id=analysis.id,
            repository_id=analysis.repository_id,
            commit_sha=analysis.commit_sha,
            analyzed_at=analysis.analyzed_at,
            facts=FactsOut(
                first_commit_at=f.first_commit_at,
                last_commit_at=f.last_commit_at,
                age_days=f.age_days,
                commit_count=f.commit_count,
                contributor_count=f.contributor_count,
                loc_total=f.loc_total,
                primary_language=f.primary_language,
                license_spdx=f.license.spdx_id,
                license_name=f.license.name,
                has_tests=f.has_tests,
                dependency_count=f.dependency_count,
            ),
            contributors=analysis.contributors,
            commit_activity=analysis.commit_activity,
            languages=analysis.languages,
            dependencies=analysis.dependencies,
            cicd=analysis.cicd,
            hotspots=analysis.hotspots,
            enrichment=analysis.enrichment,
            vulnerabilities=analysis.vulnerabilities,
            health_checks=analysis.health_checks,
            tool_runs=analysis.tool_runs,
        )


class DependencyUsageOut(BaseModel):
    repository_id: uuid.UUID
    versions: list[str]


@router.get("/repositories/{repository_id}/analysis", response_model=AnalysisOut)
def latest_analysis(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> AnalysisOut:
    analysis = SqlAnalysisRepository(session).get_latest_for_repository(repository_id)
    if analysis is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No completed analysis for this repository")
    return AnalysisOut.of(analysis)


@router.get("/dependencies/{name}/repositories", response_model=list[DependencyUsageOut])
def repositories_using_dependency(
    name: str, session: Session = Depends(get_session)
) -> list[DependencyUsageOut]:
    grouped: dict[uuid.UUID, set[str]] = defaultdict(set)
    for repo_id, version in SqlAnalysisRepository(session).dependency_usage(name):
        if version:
            grouped[repo_id].add(version)
        else:
            grouped.setdefault(repo_id, set())
    return [
        DependencyUsageOut(repository_id=rid, versions=sorted(vers))
        for rid, vers in grouped.items()
    ]


class ToolStatusOut(BaseModel):
    name: str
    available: bool
    version: str | None
    purpose: str
    install: str
    homepage: str


@router.get("/tools", response_model=list[ToolStatusOut])
def external_tools() -> list[ToolStatusOut]:
    """Availability + versions of the external analysis tools (drives docs + setup)."""
    return [ToolStatusOut(**vars(status)) for status in all_tool_statuses()]
