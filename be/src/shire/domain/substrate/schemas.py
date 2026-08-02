"""Pydantic result schemas for the Substrate domain."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from shire.domain.substrate.domain import (
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


class RepositoryContributorsResult(BaseModel):
    """One repository's contributors from its latest analysis — the cross-repo read seam.

    Consumed by the contributors bounded context to aggregate people across the whole fleet
    without reaching into the substrate's tables directly (service-to-service).
    """

    repository_id: uuid.UUID
    repository_name: str
    contributors: list[Contributor]


class CommitRecordResult(BaseModel):
    """One commit's shape, already attributed to a resolved identity email."""

    committed_at: datetime
    insertions: int
    deletions: int
    files_changed: int
    local_hour: int
    weekday: int  # 0 = Monday


class RepositoryCommitHistoryResult(BaseModel):
    """One repository's per-commit rows for a single identity email — the members read seam.

    `has_records` is False when the repo's latest analysis predates per-commit persistence
    (a repo refresh backfills it); `records` then stays empty even for active members.
    """

    repository_id: uuid.UUID
    repository_name: str
    total_commits: int
    has_records: bool
    records: list[CommitRecordResult]


class ToolLogResult(BaseModel):
    """Raw findings log for one tool's latest run (lint/SAST/dead-code/secret locations)."""

    tool: str
    log: str | None = None
    line_count: int = 0


class AnalysisSnapshotSummary(BaseModel):
    """One complete snapshot's headline scalars — the evolution timeline row."""

    analysis_id: uuid.UUID
    commit_sha: str
    analyzed_at: datetime
    loc_total: int
    commit_count: int
    contributor_count: int
    dependency_count: int
    vulnerability_count: int
    vuln_critical: int
    vuln_high: int
    secret_count: int
    health_score: float | None
    maintainability_index: float | None
    ccn_average: float | None
    code_lines: int | None
    test_count: int | None
    rating_maintainability: str
    rating_security: str
    rating_health: str


class FactDelta(BaseModel):
    """One scalar metric that changed between two snapshots."""

    field: str
    before: float | str | None
    after: float | str | None


class DependencyChange(BaseModel):
    name: str
    ecosystem: str
    before_version: str | None = None
    after_version: str | None = None


class DeltaDependencies(BaseModel):
    added: list[DependencyChange]
    removed: list[DependencyChange]
    changed: list[DependencyChange]


class LanguageShift(BaseModel):
    language: str
    before_loc: int
    after_loc: int


class DeltaContributors(BaseModel):
    joined: list[str]
    departed: list[str]


class DeltaCommitAuthor(BaseModel):
    email: str
    commits: int


class DeltaCommits(BaseModel):
    """New commits between the snapshots (sha set difference of per-commit records)."""

    count: int
    # Line churn summed over the new commits (0 when per-commit data is unavailable).
    insertions: int = 0
    deletions: int = 0
    authors: list[DeltaCommitAuthor]
    # False when either snapshot predates per-commit persistence — count falls back to the
    # commit_count fact difference and authors stay empty.
    has_commit_data: bool


class AnalysisDeltaResult(BaseModel):
    """Deterministic diff between two analysis snapshots, plus any persisted narrative."""

    repository_id: uuid.UUID
    from_analysis_id: uuid.UUID
    from_commit_sha: str
    from_analyzed_at: datetime
    to_analysis_id: uuid.UUID
    to_commit_sha: str
    to_analyzed_at: datetime
    facts: list[FactDelta]
    dependencies: DeltaDependencies
    hotspots_entered: list[str]
    hotspots_left: list[str]
    languages: list[LanguageShift]
    contributors: DeltaContributors
    commits: DeltaCommits
    note: str | None
    note_generated_at: datetime | None


class ExplainDelta(BaseModel):
    """Snapshot pair to narrate; omitted ids default to previous -> latest."""

    from_id: uuid.UUID | None = None
    to_id: uuid.UUID | None = None


class ArtifactVersionResult(BaseModel):
    """One historical generation of a Claude repo artifact."""

    id: uuid.UUID
    artifact: str
    kind: str
    branch: str
    commit_sha: str
    content: dict
    created_at: datetime


class DependencyUsageResult(BaseModel):
    repository_id: uuid.UUID
    versions: list[str]


class DependencyFreshnessItem(BaseModel):
    name: str
    ecosystem: str
    current: str | None
    latest: str | None
    latest_released_at: str | None
    gap: str  # up-to-date | patch | minor | major | unknown
    gain: str | None = None  # AI one-liner on what upgrading gets you
    latest_url: str | None = None  # changelog / release page for the latest version


class DependencyFreshnessResult(BaseModel):
    """On-demand check of each dependency's latest version + upgrade gap (Python/pip)."""

    repository_id: uuid.UUID
    generated: bool
    generated_at: datetime | None = None
    items: list[DependencyFreshnessItem] = []
    # The AI "what you gain by upgrading" lines arrive via an engine job after the deterministic
    # columns; while it's in flight the UI shows the gains column as pending.
    gains_pending: bool = False
    gains_job_id: uuid.UUID | None = None


class ArchitectureDiagram(BaseModel):
    """One diagram in the catalog. Always present; `mermaid` is filled once generated."""

    kind: str
    title: str
    description: str
    category: str  # Structural | Behavioral | Data
    mermaid_type: str
    generated: bool = False
    generated_at: datetime | None = None
    mermaid: str | None = None


class ArchitectureResult(BaseModel):
    """The architecture-diagram catalog for a repository, with any cached diagrams filled in."""

    repository_id: uuid.UUID
    diagrams: list[ArchitectureDiagram] = []
    agent_available: bool = True


class CodebaseOverviewResult(BaseModel):
    """A crisp, big-picture summary of what a codebase is — generated on demand by a hobit."""

    repository_id: uuid.UUID
    generated: bool
    generated_at: datetime | None = None
    agent_available: bool = True
    summary: str | None = None  # one sentence — what it is
    kind: str | None = None  # library | backend service | CLI | data pipeline | ML system | ...
    domain: str | None = None  # data engineering | web/SaaS | machine learning | devops | ...
    problem: str | None = None  # why it exists / what problems it solves
    features: list[str] = []  # main business-logic capabilities
    audience: str | None = None  # who it is for


class TechStackItem(BaseModel):
    """One technology the agent detected in the repository. `slug` is set only when the
    detection resolved to a row in the technology catalog (making it linkable in the UI)."""

    detected_name: str
    evidence: str | None = None  # file path or one-liner the detection is based on
    role: str | None = None  # short role: database | queue | orchestrator | ...
    slug: str | None = None  # technology catalog slug when matched


class TechStackResult(BaseModel):
    """The detected technology stack of a repository, resolved against the catalog."""

    repository_id: uuid.UUID
    generated: bool
    generated_at: datetime | None = None
    branch: str | None = None
    agent_available: bool = True
    items: list[TechStackItem] = []


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
