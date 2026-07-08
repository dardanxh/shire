"""Pydantic result schemas for the Substrate domain."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from hobits.domain.substrate.domain import (
    Analysis,
    CiCdConfig,
    Contributor,
    DailyCommitCount,
    Dependency,
    Enrichment,
    HealthCheck,
    Hotspot,
    LanguageStat,
    ToolRun,
    Vulnerability,
)
from hobits.integrations.external_tools.base import ToolStatus


class FactsResult(BaseModel):
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


class AnalysisResult(BaseModel):
    id: uuid.UUID
    repository_id: uuid.UUID
    commit_sha: str
    analyzed_at: datetime
    facts: FactsResult
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
    def of(cls, analysis: Analysis) -> AnalysisResult:
        f = analysis.facts
        return cls(
            id=analysis.id,
            repository_id=analysis.repository_id,
            commit_sha=analysis.commit_sha,
            analyzed_at=analysis.analyzed_at,
            facts=FactsResult(
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


class ToolStatusResult(BaseModel):
    name: str
    available: bool
    version: str | None
    purpose: str
    install: str
    homepage: str
    id: str
    category: str
    kind: str

    @classmethod
    def of(cls, status: ToolStatus) -> ToolStatusResult:
        return cls(**vars(status))


class DependencyUsageResult(BaseModel):
    repository_id: uuid.UUID
    versions: list[str]


class GraphResult(BaseModel):
    """State of a repository's codebase graph (emerge) artifact.

    Not part of the analysis snapshot — the graph is a standalone visualization artifact served
    under a static mount. `url` points at the generated interactive HTML app (iframe target) and is
    None until the graph has been generated.
    """

    repository_id: uuid.UUID
    generated: bool
    url: str | None = None
    generated_at: datetime | None = None
    scanned_files: int | None = None
    node_count: int | None = None
    tool_available: bool = False


class CodeAgeCohort(BaseModel):
    label: str
    lines: int


class CodeAgeResult(BaseModel):
    """State of a repository's code-age artifact (git-of-theseus stacked-area SVG).

    `url` points at the generated SVG (rendered as an image); `cohorts` is the surviving-lines
    breakdown per year as of the latest commit.
    """

    repository_id: uuid.UUID
    generated: bool
    url: str | None = None
    generated_at: datetime | None = None
    cohorts: list[CodeAgeCohort] = []
    tool_available: bool = False


class CouplingPair(BaseModel):
    entity: str
    coupled: str
    degree: float  # % of revisions in which the two files changed together
    average_revs: float


class CouplingResult(BaseModel):
    """State of a repository's temporal-coupling analysis (code-maat).

    Data, not an artifact: `pairs` are files that historically change together, ranked by coupling
    degree. Computed on demand and cached to disk so `generated_at` reflects the last run.
    """

    repository_id: uuid.UUID
    generated: bool
    generated_at: datetime | None = None
    pairs: list[CouplingPair] = []
    tool_available: bool = False


class CodeMapResult(BaseModel):
    """State of a repository's code-city map (CodeCharta).

    `url` points at the CodeCharta browser viewer with the generated map loaded (iframe target).
    `viewer_available` is separate from `tool_available`: the analyzer (ccsh) and the viewer
    (codecharta-visualization) are installed independently.
    """

    repository_id: uuid.UUID
    generated: bool
    url: str | None = None
    generated_at: datetime | None = None
    file_count: int | None = None
    tool_available: bool = False
    viewer_available: bool = False
