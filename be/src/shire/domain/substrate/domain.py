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

from shire.core.domain_base import AggregateRoot, Entity, ValueObject

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


class DependencySource(StrEnum):
    """How a dependency was found: parsed from a manifest we understand, or read out of the
    repository by the engine when the deterministic parsers couldn't cover it."""

    scan = "scan"
    ai = "ai"


class CiCdSystem(StrEnum):
    github_actions = "github_actions"
    gitlab_ci = "gitlab_ci"
    bitbucket_pipelines = "bitbucket_pipelines"
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
    source: DependencySource = DependencySource.scan
    # Latest published version as reported by whoever found the dependency. Registry lookups
    # (PyPI) stay the authority for pip; this carries the engine's answer for the ecosystems
    # and manifests no registry client covers.
    latest_version: str | None = None


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


class CommitRecord(ValueObject):
    """One commit attributed to its resolved author — per-member activity views.

    `author_email` is the canonical (most-used) email of the commit's resolved identity within
    the repo, normalized lowercase, so it matches the identity email the members context
    aggregates by even when the person committed under an alias address.
    """

    sha: str
    author_email: str
    committed_at: datetime
    insertions: int = 0
    deletions: int = 0
    files_changed: int = 0
    # Author-local clock (derived from the commit's own UTC offset) for work-pattern views.
    local_hour: int = 0
    weekday: int = 0  # 0 = Monday


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
    """Which external tool ran for an analysis and whether it contributed data.

    `log` holds the tool's raw findings text (lint violations, SAST hits, dead code, secret
    locations). It's excluded from API serialization to keep the analysis payload lean — fetch it
    on demand via the tool-log endpoint.
    """

    name: str
    available: bool
    contributed: bool
    log: str | None = Field(default=None, exclude=True)


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
    # test-metrics — testing (deterministic scanner)
    test_count: int | None = None
    test_file_count: int | None = None
    test_to_code_ratio: float | None = None
    assertion_density: float | None = None
    test_frameworks: str | None = None  # comma-joined
    test_coverage_pct: float | None = None
    # ruff — lint
    lint_issue_count: int | None = None
    # bandit — Python SAST
    sast_issue_count: int | None = None
    sast_high: int | None = None
    sast_medium: int | None = None
    sast_low: int | None = None
    # vulture — dead code
    dead_code_count: int | None = None
    # ownership — people & maintenance (git history)
    bus_factor: int | None = None
    top_author_share: float | None = None  # 0..1
    active_contributor_count: int | None = None
    commits_last_90d: int | None = None
    days_since_last_commit: int | None = None
    maintenance_status: str | None = None  # active / dormant / abandoned
    # derived
    ratings: Ratings = Field(default_factory=Ratings)


# --- aggregate ----------------------------------------------------------------


class Contributor(Entity):
    name: str
    email: str
    commits: int
    lines_added: int = 0
    lines_removed: int = 0
    files_touched: int = 0
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


class FileChange(ValueObject):
    """One file's line delta within a commit (`-` binary counts normalize to 0)."""

    path: str
    additions: int = 0
    deletions: int = 0


class CommitInfo(ValueObject):
    sha: str
    author_name: str
    author_email: str
    committed_at: datetime
    files_changed: tuple[FileChange, ...] = ()


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
    # Per-commit rows — persisted outside the Analysis aggregate (see SqlCommitRecordRepository).
    commit_records: list[CommitRecord] = Field(default_factory=list)
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
    # testing / quality / ownership metrics (best-effort)
    test_count: int | None = None
    test_file_count: int | None = None
    test_to_code_ratio: float | None = None
    assertion_density: float | None = None
    test_frameworks: str | None = None
    test_coverage_pct: float | None = None
    lint_issue_count: int | None = None
    sast_issue_count: int | None = None
    sast_high: int | None = None
    sast_medium: int | None = None
    sast_low: int | None = None
    dead_code_count: int | None = None
    bus_factor: int | None = None
    top_author_share: float | None = None
    active_contributor_count: int | None = None
    commits_last_90d: int | None = None
    days_since_last_commit: int | None = None
    maintenance_status: str | None = None
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
