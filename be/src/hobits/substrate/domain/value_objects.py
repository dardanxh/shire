"""Value objects for the Substrate bounded context (L1 facts + L2 structure)."""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum

from hobits.shared.domain.base import ValueObject


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
