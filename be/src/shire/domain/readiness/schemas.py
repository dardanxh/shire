"""Pydantic input/result schemas for AI readiness."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ArtifactState(BaseModel):
    key: str
    path: str
    kind: str  # file | dir
    role: str  # instructions | skills | commands | agents | settings | rules | config
    present: bool


class AssistantState(BaseModel):
    key: str
    name: str
    detected: bool
    artifacts: list[ArtifactState]


class ReadinessSuggestionResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    repository_id: uuid.UUID
    assistant: str
    action: str  # add | edit
    path: str
    title: str
    detail: str
    status: str  # proposed | applied
    execution_id: uuid.UUID | None
    created_at: datetime


class ReadinessExecutionResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    repository_id: uuid.UUID
    status: str  # pending | succeeded | failed
    branch: str
    base_sha: str
    commit_sha: str | None
    agent_summary: str
    suggestion_ids: list[uuid.UUID]
    error: str | None
    job_id: uuid.UUID | None
    created_at: datetime
    finished_at: datetime | None


class ReadinessStatusResult(BaseModel):
    repository_id: uuid.UUID
    scanned: bool  # False when the repository has no local clone
    assistants: list[AssistantState] = []
    suggestions: list[ReadinessSuggestionResult] = []
    executions: list[ReadinessExecutionResult] = []
    agent_available: bool = True


class ApplySuggestions(BaseModel):
    suggestion_ids: list[uuid.UUID] = Field(min_length=1)


class ReadinessOverviewItem(BaseModel):
    repository_id: uuid.UUID
    slug: str
    detected: list[str]  # assistant keys with any artifact present
    present_count: int
    expected_count: int
    proposed_count: int
