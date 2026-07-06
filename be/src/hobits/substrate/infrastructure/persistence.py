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
from hobits.substrate.domain.enrichment import (
    Enrichment,
    HealthCheck,
    Rating,
    Ratings,
    ToolRun,
    Vulnerability,
)
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

    # Phase 1.5 enrichment (external tools; nullable = tool didn't run)
    code_lines: Mapped[int | None] = mapped_column(Integer, nullable=True)
    complexity_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cocomo_cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    schedule_months: Mapped[float | None] = mapped_column(Float, nullable=True)
    ccn_average: Mapped[float | None] = mapped_column(Float, nullable=True)
    ccn_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    function_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    high_complexity_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    maintainability_index: Mapped[float | None] = mapped_column(Float, nullable=True)
    sbom_package_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    vulnerability_count: Mapped[int] = mapped_column(Integer, default=0)
    vuln_critical: Mapped[int] = mapped_column(Integer, default=0)
    vuln_high: Mapped[int] = mapped_column(Integer, default=0)
    vuln_moderate: Mapped[int] = mapped_column(Integer, default=0)
    vuln_low: Mapped[int] = mapped_column(Integer, default=0)
    secret_count: Mapped[int] = mapped_column(Integer, default=0)
    health_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    rating_maintainability: Mapped[str] = mapped_column(String(2), default="NA")
    rating_security: Mapped[str] = mapped_column(String(2), default="NA")
    rating_health: Mapped[str] = mapped_column(String(2), default="NA")

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
    vulnerabilities: Mapped[list[VulnerabilityRow]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )
    health_checks: Mapped[list[HealthCheckRow]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )
    tool_runs: Mapped[list[ToolRunRow]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )


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


class VulnerabilityRow(Base):
    __tablename__ = "vulnerabilities"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    analysis_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("analyses.id", ondelete="CASCADE"), index=True
    )
    package: Mapped[str] = mapped_column(String(255), index=True)
    ecosystem: Mapped[str] = mapped_column(String(64))
    version: Mapped[str | None] = mapped_column(String(128), nullable=True)
    vuln_id: Mapped[str] = mapped_column(String(64))
    severity: Mapped[str] = mapped_column(String(16))
    fixed_version: Mapped[str | None] = mapped_column(String(128), nullable=True)


class HealthCheckRow(Base):
    __tablename__ = "health_checks"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    analysis_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("analyses.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(128))
    score: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String)


class ToolRunRow(Base):
    __tablename__ = "tool_runs"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    analysis_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("analyses.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(64))
    available: Mapped[bool] = mapped_column(Boolean)
    contributed: Mapped[bool] = mapped_column(Boolean)


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
        enrichment=Enrichment(
            code_lines=row.code_lines,
            complexity_total=row.complexity_total,
            cocomo_cost_usd=row.cocomo_cost_usd,
            schedule_months=row.schedule_months,
            ccn_average=row.ccn_average,
            ccn_max=row.ccn_max,
            function_count=row.function_count,
            high_complexity_count=row.high_complexity_count,
            maintainability_index=row.maintainability_index,
            sbom_package_count=row.sbom_package_count,
            vulnerability_count=row.vulnerability_count,
            vuln_critical=row.vuln_critical,
            vuln_high=row.vuln_high,
            vuln_moderate=row.vuln_moderate,
            vuln_low=row.vuln_low,
            secret_count=row.secret_count,
            health_score=row.health_score,
            ratings=Ratings(
                maintainability=Rating(row.rating_maintainability),
                security=Rating(row.rating_security),
                health=Rating(row.rating_health),
            ),
        ),
        vulnerabilities=[
            Vulnerability(
                package=v.package,
                ecosystem=v.ecosystem,
                version=v.version,
                vuln_id=v.vuln_id,
                severity=v.severity,
                fixed_version=v.fixed_version,
            )
            for v in row.vulnerabilities
        ],
        health_checks=[
            HealthCheck(name=h.name, score=h.score, reason=h.reason) for h in row.health_checks
        ],
        tool_runs=[
            ToolRun(name=t.name, available=t.available, contributed=t.contributed)
            for t in row.tool_runs
        ],
    )


def _build_row(analysis: Analysis) -> AnalysisRow:
    f = analysis.facts
    e = analysis.enrichment
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
        code_lines=e.code_lines,
        complexity_total=e.complexity_total,
        cocomo_cost_usd=e.cocomo_cost_usd,
        schedule_months=e.schedule_months,
        ccn_average=e.ccn_average,
        ccn_max=e.ccn_max,
        function_count=e.function_count,
        high_complexity_count=e.high_complexity_count,
        maintainability_index=e.maintainability_index,
        sbom_package_count=e.sbom_package_count,
        vulnerability_count=e.vulnerability_count,
        vuln_critical=e.vuln_critical,
        vuln_high=e.vuln_high,
        vuln_moderate=e.vuln_moderate,
        vuln_low=e.vuln_low,
        secret_count=e.secret_count,
        health_score=e.health_score,
        rating_maintainability=e.ratings.maintainability.value,
        rating_security=e.ratings.security.value,
        rating_health=e.ratings.health.value,
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
    row.vulnerabilities = [
        VulnerabilityRow(
            package=v.package,
            ecosystem=v.ecosystem,
            version=v.version,
            vuln_id=v.vuln_id,
            severity=v.severity,
            fixed_version=v.fixed_version,
        )
        for v in analysis.vulnerabilities
    ]
    row.health_checks = [
        HealthCheckRow(name=h.name, score=h.score, reason=h.reason) for h in analysis.health_checks
    ]
    row.tool_runs = [
        ToolRunRow(name=t.name, available=t.available, contributed=t.contributed)
        for t in analysis.tool_runs
    ]
    return row


class SqlAnalysisRepository:
    """Concrete `AnalysisRepository` port bound to a SQLAlchemy session."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, analysis: Analysis) -> None:
        # Re-analysis of the same commit replaces the prior snapshot (idempotent).
        existing = self._session.scalars(
            select(AnalysisRow).where(
                AnalysisRow.repository_id == analysis.repository_id,
                AnalysisRow.commit_sha == analysis.commit_sha,
            )
        ).first()
        if existing is not None:
            self._session.delete(existing)
            self._session.flush()
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
