"""Pydantic input/result schemas for the CI/CD analysis.

The environment/transition shapes double as the contract the engine's JSON must satisfy (parsed
by hand in `jobs.py`, per this codebase's "fenced json as the last thing" convention) and as the
response models the UI renders.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# Closed vocabularies. Kept here (not in the DB) for the shapes the engine fills; the columns
# that ARE constrained in the database repeat these values in check constraints.
ENVIRONMENT_KINDS = ("prod", "staging", "qa", "dev", "preview", "other")
SUGGESTION_CATEGORIES = (
    "caching",
    "parallelism",
    "simplification",
    "security",
    "reliability",
    "cost",
    "observability",
    "practice",
)
IMPACTS = ("high", "medium", "low")
EFFORTS = ("high", "medium", "low")


class CicdEnvironment(BaseModel):
    """A long-living environment the pipeline deploys to.

    Everything above `branch_exists` comes from the pipeline config (the engine); the fields
    below it are live git facts filled in server-side from the branch inspection, so a
    "qa is 41 days stale" signal costs no extra AI call.
    """

    key: str
    name: str
    kind: str = "other"
    branch: str = ""
    deploy_target: str = ""
    trigger: str = ""
    gates: list[str] = []
    auto_deploy: bool = False
    notes: str = ""
    source_file: str = ""

    branch_exists: bool | None = None
    last_commit_at: datetime | None = None
    last_commit_author: str | None = None
    ahead: int | None = None
    behind: int | None = None


class CicdTransition(BaseModel):
    """How a change is promoted from one environment to the next."""

    from_env: str
    to_env: str
    trigger: str = ""
    # Short step/job names only ("build", "lint", "test", "publish image").
    steps: list[str] = []
    gates: list[str] = []
    source_file: str = ""


class CicdPipeline(BaseModel):
    file: str
    name: str = ""
    triggers: list[str] = []
    jobs: list[str] = []


class CicdSuggestionResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    repository_id: uuid.UUID
    source: str  # scan | hobit
    category: str
    impact: str  # high | medium | low
    effort: str  # high | medium | low
    title: str
    detail: str
    paths: list[str]
    status: str  # proposed | applied
    execution_id: uuid.UUID | None
    created_at: datetime


class CicdExecutionResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    repository_id: uuid.UUID
    status: str  # pending | succeeded | failed
    branch: str
    base_sha: str
    commit_sha: str | None
    agent_summary: str
    changed_files: list[str]
    suggestion_ids: list[uuid.UUID]
    error: str | None
    job_id: uuid.UUID | None
    created_at: datetime
    finished_at: datetime | None


class CicdAnalysisResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    platforms: list[str]
    config_files: list[str]
    summary: str
    environments: list[CicdEnvironment]
    transitions: list[CicdTransition]
    pipelines: list[CicdPipeline]
    branch: str
    commit_sha: str
    generated_at: datetime


class CicdHobitRun(BaseModel):
    """The latest `ci-cd` hobit run, so the tab can show its verdict next to the scan's."""

    id: uuid.UUID
    status: str
    headline: str | None = None
    tier: str | None = None
    finished_at: datetime | None = None


class CicdPipelineFile(BaseModel):
    path: str
    system: str


class CicdStatusResult(BaseModel):
    repository_id: uuid.UUID
    cloned: bool = False
    # Deterministic filename detection — available before any AI runs.
    detected_files: list[CicdPipelineFile] = []
    platforms: list[str] = []
    analysis: CicdAnalysisResult | None = None
    suggestions: list[CicdSuggestionResult] = []
    executions: list[CicdExecutionResult] = []
    # Derived from unsettled job rows, never stored — always true after a reload.
    scan_pending: bool = False
    scan_job_id: uuid.UUID | None = None
    hobit_pending: bool = False
    hobit_run: CicdHobitRun | None = None
    agent_available: bool = True


class ApplyCicdSuggestions(BaseModel):
    suggestion_ids: list[uuid.UUID] = Field(min_length=1)
