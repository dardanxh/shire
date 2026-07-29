"""Pydantic read models for the Home dashboard (system status + onboarding checklist)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class ClaudeStatusResult(BaseModel):
    """Whether the Claude Code CLI — the platform's engine substrate — is usable."""

    installed: bool
    # First line of `claude --version` (cached with a short TTL server-side).
    version: str | None
    # The engine's default model (engine_config.model, editable on Jobs → Config).
    default_model: str


class EngineStatusResult(BaseModel):
    """Whether a Shire engine worker is alive."""

    running: bool
    # Live Postgres backends holding `LISTEN shire_jobs_new` — one per engine instance.
    listeners: int
    last_job_activity_at: datetime | None
    # How `running` was determined ("pg listener" | "recent job activity"), for the UI hint.
    detail: str | None


class OnboardingChecklistResult(BaseModel):
    """Raw facts the checklist derives its item states from (booleans computed client-side)."""

    repository_count: int
    connection_count: int
    principle_count: int
    has_linked_tool: bool
    has_hobit_run: bool
    # Oldest repository — the deep-link target for the tool-link / hobit-run CTAs.
    first_repository_id: uuid.UUID | None


class AttentionResult(BaseModel):
    """Counts of everything currently waiting on the user, for the Home inbox strip."""

    drift_findings: int  # open drift proposals awaiting accept/dismiss
    open_prs: int  # roadmap tickets with an AI-opened PR still open
    failed_jobs_24h: int
    violated_principles: int  # (principle, repo) pairs whose newest check is violated
    briefing_now_unread: int  # unread NOW-tier briefing items


class HomeStatusResult(BaseModel):
    claude: ClaudeStatusResult
    engine: EngineStatusResult
    checklist: OnboardingChecklistResult
    attention: AttentionResult


class ActivityEventResult(BaseModel):
    """One entry of the Home activity feed — a recent piece of work, newest first."""

    # The source row's id: the job id for job-backed events, otherwise the entity id
    # (repository, council topic, merge review) the event describes.
    id: uuid.UUID
    # A job kind verbatim (e.g. "hobit.run", "substrate.architecture") or one of the
    # synthesized kinds: "repository.onboarded", "repository.analyzed",
    # "council.convened", "merge_review.created".
    kind: str
    title: str
    status: str | None
    repository_id: uuid.UUID | None
    repository_slug: str | None
    occurred_at: datetime
