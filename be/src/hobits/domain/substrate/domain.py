"""Substrate bounded-context domain: the Analysis aggregate, its value objects, enrichment, ports.

Scanners are pure functions of a `ScanContext` (extracted git data + a clone path) returning a
`ScanContribution`. The uniform interface is the reusability seam — every scanner is independently
testable and pluggable. The domain imports no SQLAlchemy / subprocess / httpx.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime
from enum import StrEnum
from pathlib import Path
from typing import Protocol

from pydantic import Field

from hobits.core.domain_base import AggregateRoot, Entity, ValueObject

# --- value objects (L1 facts + L2 structure) ----------------------------------


class AnalysisStatus(StrEnum):
    running = "running"
    complete = "complete"
    failed = "failed"


class Ecosystem(StrEnum):
    pip = "pip"
    npm = "npm"
    cargo = "cargo"
    go = "go"
    maven = "maven"
    gem = "gem"
    composer = "composer"
    generic = "generic"


class CiCdSystem(StrEnum):
    github_actions = "github_actions"
    gitlab_ci = "gitlab_ci"
    circleci = "circleci"
    jenkins = "jenkins"
    travis = "travis"
    azure_pipelines = "azure_pipelines"
    drone = "drone"
    other = "other"


class LicenseInfo(ValueObject):
    spdx_id: str | None = None
    name: str | None = None
    source_file: str | None = None


class LanguageStat(ValueObject):
    language: str
    loc: int
    files: int
    pct: float  # share of total LOC, 0..100


class Dependency(ValueObject):
    ecosystem: Ecosystem
    name: str
    version: str | None = None
    manifest_file: str
    is_dev: bool = False


class CiCdConfig(ValueObject):
    system: CiCdSystem
    config_files: tuple[str, ...]


class Hotspot(ValueObject):
    """A risk zone: changes often (churn) AND is large (size)."""

    path: str
    churn: int  # number of commits touching the file
    size: int  # bytes (proxy for complexity)
    score: int  # churn * size


class DailyCommitCount(ValueObject):
    day: date
    count: int


class RepositoryFacts(ValueObject):
    """The L1 scalar fact bundle, embedded on an Analysis."""

    first_commit_at: datetime | None = None
    last_commit_at: datetime | None = None
    commit_count: int = 0
    contributor_count: int = 0
    loc_total: int = 0
    primary_language: str | None = None
    license: LicenseInfo = LicenseInfo()
    has_tests: bool = False
    dependency_count: int = 0

    @property
    def age_days(self) -> int | None:
        if self.first_commit_at and self.last_commit_at:
            return (self.last_commit_at - self.first_commit_at).days
        return None


# --- enrichment (external-tool metrics + derived ratings) ---------------------


class Rating(StrEnum):
    a = "A"
    b = "B"
    c = "C"
    d = "D"
    e = "E"
    na = "NA"


class Ratings(ValueObject):
    """Derived A-E ratings (NA when the underlying tool didn't run)."""

    maintainability: Rating = Rating.na
    security: Rating = Rating.na
    health: Rating = Rating.na


class Vulnerability(ValueObject):
    package: str
    ecosystem: str
    version: str | None = None
    vuln_id: str
    severity: str
    fixed_version: str | None = None


class HealthCheck(ValueObject):
    name: str
    score: int  # 0-10, or -1 when inconclusive
    reason: str


class ToolRun(ValueObject):
    """Which external tool ran for an analysis and whether it contributed data."""

    name: str
    available: bool
    contributed: bool


class Enrichment(ValueObject):
    """Scalar enrichment bundle embedded on an Analysis (all tool-sourced, best-effort)."""

    # scc — code metrics
    code_lines: int | None = None
    complexity_total: int | None = None
    cocomo_cost_usd: float | None = None
    schedule_months: float | None = None
    # lizard — complexity
    ccn_average: float | None = None
    ccn_max: int | None = None
    function_count: int | None = None
    high_complexity_count: int | None = None
    # radon — maintainability (Python)
    maintainability_index: float | None = None
    # syft — SBOM
    sbom_package_count: int | None = None
    # osv-scanner — vulnerabilities
    vulnerability_count: int = 0
    vuln_critical: int = 0
    vuln_high: int = 0
    vuln_moderate: int = 0
    vuln_low: int = 0
    # gitleaks — secrets
    secret_count: int = 0
    # scorecard — health
    health_score: float | None = None
    # derived
    ratings: Ratings = Field(default_factory=Ratings)


# --- aggregate ----------------------------------------------------------------


class Contributor(Entity):
    name: str
    email: str
    commits: int
    first_commit_at: datetime | None = None
    last_commit_at: datetime | None = None


class Analysis(AggregateRoot):
    """A point-in-time snapshot of the substrate. Immutable once `complete`.

    Child collections are owned by the Analysis and persisted/replaced with it atomically.
    """

    repository_id: uuid.UUID
    commit_sha: str
    status: AnalysisStatus = AnalysisStatus.running
    analyzed_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    facts: RepositoryFacts = Field(default_factory=RepositoryFacts)
    contributors: list[Contributor] = Field(default_factory=list)
    commit_activity: list[DailyCommitCount] = Field(default_factory=list)
    languages: list[LanguageStat] = Field(default_factory=list)
    dependencies: list[Dependency] = Field(default_factory=list)
    cicd: list[CiCdConfig] = Field(default_factory=list)
    hotspots: list[Hotspot] = Field(default_factory=list)

    # Phase 1.5 enrichment (external tools; best-effort)
    enrichment: Enrichment = Field(default_factory=Enrichment)
    vulnerabilities: list[Vulnerability] = Field(default_factory=list)
    health_checks: list[HealthCheck] = Field(default_factory=list)
    tool_runs: list[ToolRun] = Field(default_factory=list)

    def complete(self) -> None:
        self.status = AnalysisStatus.complete


# --- ports --------------------------------------------------------------------


class CommitInfo(ValueObject):
    sha: str
    author_name: str
    author_email: str
    committed_at: datetime
    files_changed: tuple[str, ...] = ()


@dataclass(frozen=True)
class ScanContext:
    """Everything a scanner may read: the clone on disk + the extracted commit history."""

    clone_path: Path
    head_sha: str
    commits: tuple[CommitInfo, ...]
    repo_url: str | None = None


class ScanContribution(ValueObject):
    """A partial result. The pipeline merges contributions into one Analysis."""

    first_commit_at: datetime | None = None
    last_commit_at: datetime | None = None
    commit_count: int | None = None
    contributors: list[Contributor] = Field(default_factory=list)
    commit_activity: list[DailyCommitCount] = Field(default_factory=list)
    languages: list[LanguageStat] = Field(default_factory=list)
    loc_total: int | None = None
    primary_language: str | None = None
    dependencies: list[Dependency] = Field(default_factory=list)
    cicd: list[CiCdConfig] = Field(default_factory=list)
    hotspots: list[Hotspot] = Field(default_factory=list)
    license: LicenseInfo | None = None
    has_tests: bool | None = None

    # Phase 1.5 enrichment (external tools; each optional / best-effort)
    code_lines: int | None = None
    complexity_total: int | None = None
    cocomo_cost_usd: float | None = None
    schedule_months: float | None = None
    ccn_average: float | None = None
    ccn_max: int | None = None
    function_count: int | None = None
    high_complexity_count: int | None = None
    maintainability_index: float | None = None
    sbom_package_count: int | None = None
    vulnerabilities: list[Vulnerability] = Field(default_factory=list)
    secret_count: int | None = None
    health_score: float | None = None
    health_checks: list[HealthCheck] = Field(default_factory=list)
    tool_runs: list[ToolRun] = Field(default_factory=list)


class Scanner(Protocol):
    """A deterministic substrate scanner."""

    name: str

    def scan(self, ctx: ScanContext) -> ScanContribution: ...


class AnalysisRepository(Protocol):
    """Persistence port for the Analysis aggregate."""

    def add(self, analysis: Analysis) -> None: ...
    def get(self, analysis_id: uuid.UUID) -> Analysis | None: ...
    def get_latest_for_repository(self, repository_id: uuid.UUID) -> Analysis | None: ...
    def list_for_repository(self, repository_id: uuid.UUID) -> list[Analysis]: ...
