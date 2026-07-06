"""Ports for the Substrate bounded context.

Scanners are pure functions of a `ScanContext` (already-extracted git data + a clone path) and
return a `ScanContribution`. This keeps every scanner independently testable and pluggable — the
uniform interface is the reusability seam.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Protocol

from pydantic import Field

from hobits.shared.domain.base import ValueObject
from hobits.substrate.domain.enrichment import HealthCheck, ToolRun, Vulnerability
from hobits.substrate.domain.models import Analysis, Contributor
from hobits.substrate.domain.value_objects import (
    CiCdConfig,
    DailyCommitCount,
    Dependency,
    Hotspot,
    LanguageStat,
    LicenseInfo,
)


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
