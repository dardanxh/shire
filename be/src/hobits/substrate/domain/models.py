"""The Analysis aggregate — an immutable substrate snapshot for one repository commit."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from pydantic import Field

from hobits.shared.domain.base import AggregateRoot, Entity
from hobits.substrate.domain.value_objects import (
    AnalysisStatus,
    CiCdConfig,
    DailyCommitCount,
    Dependency,
    Hotspot,
    LanguageStat,
    RepositoryFacts,
)


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

    def complete(self) -> None:
        self.status = AnalysisStatus.complete
