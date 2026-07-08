"""Hobits domain: value objects, the hobit spec/protocol, and run records.

No SQLAlchemy here. `HobitSpec` + `Hobit` describe a code-defined hobit (its defaults + run logic);
`HobitConfigOverride`/`HobitConfig` model the editable config layer; `HobitOutput`/`SelfScore` are
the structured result the agent must return; `HobitRunRecord` is the persisted run, ORM-free.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Protocol

from pydantic import BaseModel, field_validator


class HobitRunStatus(StrEnum):
    completed = "completed"
    parse_failed = "parse_failed"
    agent_unavailable = "agent_unavailable"
    timeout = "timeout"
    error = "error"


class SelfScore(BaseModel):
    """A hobit's self-assessment of its finding, integers 0-100 (clamped)."""

    importance: int
    confidence: int
    urgency: int

    @field_validator("importance", "confidence", "urgency", mode="before")
    @classmethod
    def _clamp(cls, value: object) -> int:
        try:
            n = round(float(value))  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return 0
        return max(0, min(100, n))


class HobitOutput(BaseModel):
    """The structured result a hobit must return (parsed from its final fenced JSON)."""

    headline: str
    narrative: str
    self_score: SelfScore


@dataclass(frozen=True)
class HobitContext:
    """What a hobit is handed to do its work."""

    repository_id: uuid.UUID
    slug: str
    repo_slug: str  # owner/name
    clone_path: str
    context_markdown: str  # the effective context pack, embedded so the run is robust


@dataclass(frozen=True)
class HobitSpec:
    """A code-defined hobit's identity + defaults. Overridable via config."""

    slug: str
    name: str
    description: str
    layer: str  # e.g. "L3"
    default_charter: str
    default_instructions: str
    default_model: str
    default_timeout_seconds: float


class Hobit(Protocol):
    """The run logic of a hobit (registered in the code registry)."""

    spec: HobitSpec

    def build_prompt(self, ctx: HobitContext, instructions: str) -> str: ...
    def parse_output(self, text: str) -> HobitOutput | None: ...


@dataclass(frozen=True)
class HobitConfigOverride:
    """The persisted override row (NULLs mean "use the spec default")."""

    slug: str
    enabled: bool | None
    model: str | None
    charter: str | None
    instructions: str | None
    timeout_seconds: float | None


@dataclass(frozen=True)
class HobitConfig:
    """Effective config = spec defaults ⊕ override."""

    slug: str
    enabled: bool
    model: str
    charter: str
    instructions: str
    timeout_seconds: float


@dataclass(frozen=True)
class HobitRunRecord:
    id: uuid.UUID
    repository_id: uuid.UUID
    hobit_slug: str
    status: str
    commit_sha: str | None
    headline: str | None
    narrative: str | None
    importance: int | None
    confidence: int | None
    urgency: int | None
    tier: str | None
    raw_output: str | None
    error: str | None
    duration_seconds: float | None
    started_at: datetime
    finished_at: datetime | None
