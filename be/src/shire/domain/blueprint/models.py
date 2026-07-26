"""ORM models for blueprints and their ordered stages."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from shire.core.db import Base


class ArchitectureBlueprintRow(Base):
    __tablename__ = "architecture_blueprints"
    __table_args__ = (
        CheckConstraint("source IN ('seed', 'user')", name="ck_architecture_blueprints_source"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    use_case: Mapped[str] = mapped_column(String(300), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    # Guidance as one-sentence bullets (rendered as cards in the UI).
    when_to_use: Mapped[list[str]] = mapped_column(JSONB, default=list)
    when_not_to_use: Mapped[list[str]] = mapped_column(JSONB, default=list)
    # Supported use-case slugs (reporting | realtime | ml | embedded | activation |
    # compliance | integration | self_serve | ai | operational).
    use_cases: Mapped[list[str]] = mapped_column(JSONB, default=list)
    # Risk areas: [{title, detail}] — the parts of the architecture that bite.
    hot_spots: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    # Overall pattern complexity / ops burden: low | medium | high.
    complexity: Mapped[str] = mapped_column(String(10), default="medium")
    # Evolution edges: [{to_slug, reason}] — architectures this one grows into.
    evolution: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    # Multi-view diagrams: [{kind, mermaid}] with kind in
    # conceptual | logical | data_flow | sequence (conceptual first/default).
    diagrams: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    family_tags: Mapped[list[str]] = mapped_column(JSONB, default=list)
    # Soft references to archetype slugs — drives "suggested blueprints" on projects.
    archetype_slugs: Mapped[list[str]] = mapped_column(JSONB, default=list)
    # Interactive-canvas visual layer (separate from the manual diagram_mermaid string).
    # flows: [{id, source_stage_id, target_stage_id, label, kind, ...}] — data-flow
    # edges between stages (by stage id).
    flows: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    source: Mapped[str] = mapped_column(String(10), default="user")
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    stages: Mapped[list[BlueprintStageRow]] = relationship(
        back_populates="blueprint",
        cascade="all, delete-orphan",
        order_by="BlueprintStageRow.position",
    )


class BlueprintStageRow(Base):
    __tablename__ = "blueprint_stages"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    blueprint_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("architecture_blueprints.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(160))
    role: Mapped[str] = mapped_column(Text, default="")
    # Nullable: some stages have no sensible corpus pick (e.g. "custom API layer").
    recommended_technology_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("technologies.id", ondelete="RESTRICT"), nullable=True
    )
    # UUIDs as strings (JSONB).
    alternative_technology_ids: Mapped[list[str]] = mapped_column(JSONB, default=list)
    rationale: Mapped[str] = mapped_column(Text, default="")
    # Canvas coordinates + size (nullable → auto-arranged/default on first open).
    pos_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    pos_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    width: Mapped[float | None] = mapped_column(Float, nullable=True)
    height: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Manual accent colour ("" = auto from the primary tool's category), deployment
    # environment ("" | dev | qa | prod), and component owner.
    custom_color: Mapped[str] = mapped_column(String(32), default="")
    environment: Mapped[str] = mapped_column(String(16), default="")
    owner_name: Mapped[str] = mapped_column(String(160), default="")
    owner_email: Mapped[str] = mapped_column(String(254), default="")

    blueprint: Mapped[ArchitectureBlueprintRow] = relationship(back_populates="stages")
