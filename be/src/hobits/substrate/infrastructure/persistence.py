"""SQLAlchemy persistence for the Analysis aggregate and its child collections."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    select,
)
from sqlalchemy.orm import Mapped, Session, mapped_column, relationship

from hobits.shared.infrastructure.db import Base
from hobits.shared.infrastructure.settings import get_settings
from hobits.substrate.domain.models import Analysis, Contributor
from hobits.substrate.domain.value_objects import (
    AnalysisStatus,
    CiCdConfig,
    CiCdSystem,
    DailyCommitCount,
    Dependency,
    Ecosystem,
    Hotspot,
    LanguageStat,
    LicenseInfo,
    RepositoryFacts,
)

_EMBEDDING_DIM = get_settings().embedding_dim


class AnalysisRow(Base):
    __tablename__ = "analyses"
    __table_args__ = (
        UniqueConstraint("repository_id", "commit_sha", name="uq_analysis_repo_commit"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    repository_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    commit_sha: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16))
    analyzed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    # L1 scalar facts
    first_commit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_commit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    commit_count: Mapped[int] = mapped_column(Integer, default=0)
    contributor_count: Mapped[int] = mapped_column(Integer, default=0)
    loc_total: Mapped[int] = mapped_column(Integer, default=0)
    primary_language: Mapped[str | None] = mapped_column(String(64), nullable=True)
    license_spdx: Mapped[str | None] = mapped_column(String(64), nullable=True)
    license_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    license_source_file: Mapped[str | None] = mapped_column(String(255), nullable=True)
    has_tests: Mapped[bool] = mapped_column(Boolean, default=False)
    dependency_count: Mapped[int] = mapped_column(Integer, default=0)

    contributors: Mapped[list[ContributorRow]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )
    commit_activity: Mapped[list[CommitActivityRow]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )
    languages: Mapped[list[LanguageStatRow]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )
    dependencies: Mapped[list[DependencyRow]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )
    cicd: Mapped[list[CiCdRow]] = relationship(cascade="all, delete-orphan", lazy="selectin")
    hotspots: Mapped[list[HotspotRow]] = relationship(cascade="all, delete-orphan", lazy="selectin")


class ContributorRow(Base):
    __tablename__ = "contributors"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    analysis_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("analyses.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(320))
    commits: Mapped[int] = mapped_column(Integer)
    first_commit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_commit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CommitActivityRow(Base):
    __tablename__ = "commit_activity"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    analysis_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("analyses.id", ondelete="CASCADE"), index=True
    )
    day: Mapped[date] = mapped_column(Date)
    count: Mapped[int] = mapped_column(Integer)


class LanguageStatRow(Base):
    __tablename__ = "language_stats"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    analysis_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("analyses.id", ondelete="CASCADE"), index=True
    )
    language: Mapped[str] = mapped_column(String(64))
    loc: Mapped[int] = mapped_column(Integer)
    files: Mapped[int] = mapped_column(Integer)
    pct: Mapped[float] = mapped_column(Float)


class DependencyRow(Base):
    __tablename__ = "dependencies"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    analysis_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("analyses.id", ondelete="CASCADE"), index=True
    )
    ecosystem: Mapped[str] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    version: Mapped[str | None] = mapped_column(String(128), nullable=True)
    manifest_file: Mapped[str] = mapped_column(String(255))
    is_dev: Mapped[bool] = mapped_column(Boolean, default=False)


class CiCdRow(Base):
    __tablename__ = "cicd_configs"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    analysis_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("analyses.id", ondelete="CASCADE"), index=True
    )
    system: Mapped[str] = mapped_column(String(32))
    config_files: Mapped[list] = mapped_column(JSON)


class HotspotRow(Base):
    __tablename__ = "hotspots"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    analysis_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("analyses.id", ondelete="CASCADE"), index=True
    )
    path: Mapped[str] = mapped_column(String(1024))
    churn: Mapped[int] = mapped_column(Integer)
    size: Mapped[int] = mapped_column(Integer)
    score: Mapped[int] = mapped_column(Integer)


class CodeChunkRow(Base):
    """Scaffold for the semantic code index (Phase 1: schema only, not populated)."""

    __tablename__ = "code_chunks"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    analysis_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("analyses.id", ondelete="CASCADE"), index=True
    )
    path: Mapped[str] = mapped_column(String(1024))
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(_EMBEDDING_DIM), nullable=True)


# --- mapping ------------------------------------------------------------------


def _to_domain(row: AnalysisRow) -> Analysis:
    return Analysis(
        id=row.id,
        repository_id=row.repository_id,
        commit_sha=row.commit_sha,
        status=AnalysisStatus(row.status),
        analyzed_at=row.analyzed_at,
        facts=RepositoryFacts(
            first_commit_at=row.first_commit_at,
            last_commit_at=row.last_commit_at,
            commit_count=row.commit_count,
            contributor_count=row.contributor_count,
            loc_total=row.loc_total,
            primary_language=row.primary_language,
            license=LicenseInfo(
                spdx_id=row.license_spdx,
                name=row.license_name,
                source_file=row.license_source_file,
            ),
            has_tests=row.has_tests,
            dependency_count=row.dependency_count,
        ),
        contributors=[
            Contributor(
                id=c.id,
                name=c.name,
                email=c.email,
                commits=c.commits,
                first_commit_at=c.first_commit_at,
                last_commit_at=c.last_commit_at,
            )
            for c in row.contributors
        ],
        commit_activity=[DailyCommitCount(day=a.day, count=a.count) for a in row.commit_activity],
        languages=[
            LanguageStat(language=x.language, loc=x.loc, files=x.files, pct=x.pct)
            for x in row.languages
        ],
        dependencies=[
            Dependency(
                ecosystem=Ecosystem(d.ecosystem),
                name=d.name,
                version=d.version,
                manifest_file=d.manifest_file,
                is_dev=d.is_dev,
            )
            for d in row.dependencies
        ],
        cicd=[
            CiCdConfig(system=CiCdSystem(c.system), config_files=tuple(c.config_files))
            for c in row.cicd
        ],
        hotspots=[
            Hotspot(path=h.path, churn=h.churn, size=h.size, score=h.score) for h in row.hotspots
        ],
    )


def _build_row(analysis: Analysis) -> AnalysisRow:
    f = analysis.facts
    row = AnalysisRow(
        id=analysis.id,
        repository_id=analysis.repository_id,
        commit_sha=analysis.commit_sha,
        status=analysis.status.value,
        analyzed_at=analysis.analyzed_at,
        first_commit_at=f.first_commit_at,
        last_commit_at=f.last_commit_at,
        commit_count=f.commit_count,
        contributor_count=f.contributor_count,
        loc_total=f.loc_total,
        primary_language=f.primary_language,
        license_spdx=f.license.spdx_id,
        license_name=f.license.name,
        license_source_file=f.license.source_file,
        has_tests=f.has_tests,
        dependency_count=f.dependency_count,
    )
    row.contributors = [
        ContributorRow(
            id=c.id,
            name=c.name,
            email=c.email,
            commits=c.commits,
            first_commit_at=c.first_commit_at,
            last_commit_at=c.last_commit_at,
        )
        for c in analysis.contributors
    ]
    row.commit_activity = [
        CommitActivityRow(day=a.day, count=a.count) for a in analysis.commit_activity
    ]
    row.languages = [
        LanguageStatRow(language=x.language, loc=x.loc, files=x.files, pct=x.pct)
        for x in analysis.languages
    ]
    row.dependencies = [
        DependencyRow(
            ecosystem=d.ecosystem.value,
            name=d.name,
            version=d.version,
            manifest_file=d.manifest_file,
            is_dev=d.is_dev,
        )
        for d in analysis.dependencies
    ]
    row.cicd = [
        CiCdRow(system=c.system.value, config_files=list(c.config_files)) for c in analysis.cicd
    ]
    row.hotspots = [
        HotspotRow(path=h.path, churn=h.churn, size=h.size, score=h.score)
        for h in analysis.hotspots
    ]
    return row


class SqlAnalysisRepository:
    """Concrete `AnalysisRepository` port bound to a SQLAlchemy session."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, analysis: Analysis) -> None:
        self._session.add(_build_row(analysis))

    def get(self, analysis_id: uuid.UUID) -> Analysis | None:
        row = self._session.get(AnalysisRow, analysis_id)
        return _to_domain(row) if row else None

    def get_latest_for_repository(self, repository_id: uuid.UUID) -> Analysis | None:
        stmt = (
            select(AnalysisRow)
            .where(
                AnalysisRow.repository_id == repository_id,
                AnalysisRow.status == AnalysisStatus.complete.value,
            )
            .order_by(AnalysisRow.analyzed_at.desc())
            .limit(1)
        )
        row = self._session.scalars(stmt).first()
        return _to_domain(row) if row else None

    def list_for_repository(self, repository_id: uuid.UUID) -> list[Analysis]:
        stmt = (
            select(AnalysisRow)
            .where(AnalysisRow.repository_id == repository_id)
            .order_by(AnalysisRow.analyzed_at.desc())
        )
        return [_to_domain(r) for r in self._session.scalars(stmt)]

    def dependency_usage(self, name: str) -> list[tuple[uuid.UUID, str | None]]:
        """Cross-repo: which repositories depend on `name` (and at what versions)."""
        stmt = (
            select(AnalysisRow.repository_id, DependencyRow.version)
            .join(DependencyRow, DependencyRow.analysis_id == AnalysisRow.id)
            .where(
                DependencyRow.name == name,
                AnalysisRow.status == AnalysisStatus.complete.value,
            )
            .distinct()
        )
        return [(rid, ver) for rid, ver in self._session.execute(stmt).all()]
