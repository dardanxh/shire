"""SQLAlchemy ORM entities for the Analysis aggregate and its child collections."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from shire.core.db import Base
from shire.core.settings import get_settings

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
    # Testing / Python-quality / ownership metrics (nullable = tool didn't run)
    test_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    test_file_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    test_to_code_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    assertion_density: Mapped[float | None] = mapped_column(Float, nullable=True)
    test_frameworks: Mapped[str | None] = mapped_column(String(255), nullable=True)
    test_coverage_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    lint_issue_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sast_issue_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sast_high: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sast_medium: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sast_low: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dead_code_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bus_factor: Mapped[int | None] = mapped_column(Integer, nullable=True)
    top_author_share: Mapped[float | None] = mapped_column(Float, nullable=True)
    active_contributor_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    commits_last_90d: Mapped[int | None] = mapped_column(Integer, nullable=True)
    days_since_last_commit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    maintenance_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
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
    lines_added: Mapped[int] = mapped_column(Integer, default=0)
    lines_removed: Mapped[int] = mapped_column(Integer, default=0)
    files_touched: Mapped[int] = mapped_column(Integer, default=0)
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


class ArtifactVersionRow(Base):
    """One generation of a Claude-produced repo artifact (architecture diagram, codebase
    overview, tech stack). Disk singletons remain the "current" cache; these rows keep the
    history so evolution can be walked even across branch switches (rows are never cleared)."""

    __tablename__ = "artifact_versions"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    repository_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    # "architecture" | "codebase-overview" | "tech-stack"
    artifact: Mapped[str] = mapped_column(String(32))
    # Diagram kind slug for architecture; "" for single-kind artifacts.
    kind: Mapped[str] = mapped_column(String(64), default="")
    branch: Mapped[str] = mapped_column(String(255), default="")
    # Repo HEAD (last analyzed commit) when the artifact was generated.
    commit_sha: Mapped[str] = mapped_column(String(64), default="")
    content: Mapped[dict] = mapped_column(JSON)
    # sha256 of canonical content — identical regenerations don't append noise versions.
    content_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AnalysisDeltaNoteRow(Base):
    """On-demand Claude narrative explaining what changed between two analysis snapshots."""

    __tablename__ = "analysis_delta_notes"
    __table_args__ = (
        UniqueConstraint(
            "from_analysis_id", "to_analysis_id", name="uq_delta_note_pair"
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    repository_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    from_analysis_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    to_analysis_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    narrative: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CommitRecordRow(Base):
    """One commit of an analysis's history, attributed to its resolved author identity.

    Deliberately NOT a relationship on AnalysisRow — histories run to tens of thousands of
    rows and must never selectin-load with the aggregate. Writes/reads go through
    SqlCommitRecordRepository; deletes ride the FK's ON DELETE CASCADE.
    """

    __tablename__ = "commit_records"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    analysis_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("analyses.id", ondelete="CASCADE"), index=True
    )
    sha: Mapped[str] = mapped_column(String(64))
    # Canonical (most-used) email of the resolved author identity, normalized lowercase — matches
    # the identity email the members context aggregates by, even for alias addresses.
    author_email: Mapped[str] = mapped_column(String(320), index=True)
    committed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    insertions: Mapped[int] = mapped_column(Integer, default=0)
    deletions: Mapped[int] = mapped_column(Integer, default=0)
    files_changed: Mapped[int] = mapped_column(Integer, default=0)
    # Author-local clock (from the commit's own UTC offset) for work-pattern views.
    local_hour: Mapped[int] = mapped_column(SmallInteger, default=0)
    weekday: Mapped[int] = mapped_column(SmallInteger, default=0)  # 0 = Monday


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
    # churn * size — overflows int32 on big, hot files (e.g. fastapi's release notes).
    score: Mapped[int] = mapped_column(BigInteger)


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
    log: Mapped[str | None] = mapped_column(Text, nullable=True)


class RepositoryToolRow(Base):
    """Which integrations are linked to a repository — the allow-list the analysis pipeline runs.

    A repo with no rows is treated as unconfigured (auto-linked on next analyze).
    """

    __tablename__ = "repository_tools"

    repository_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("repositories.id", ondelete="CASCADE"), primary_key=True
    )
    tool_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


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
