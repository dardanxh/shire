"""Pydantic I/O schemas for the roadmap domain (Create / Update / Result)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from hobits.domain.repository.models import RepositoryRow
from hobits.domain.roadmap.models import (
    RoadmapDriftCheckRow,
    RoadmapDriftFindingRow,
    RoadmapExecutionRow,
    RoadmapItemRow,
    RoadmapMilestoneRow,
    RoadmapRow,
    RoadmapVersionRow,
)

QUADRANTS = ("do_first", "schedule", "delegate", "later")


def quadrant_of(*, urgent: bool, important: bool) -> str:
    if important:
        return "do_first" if urgent else "schedule"
    return "delegate" if urgent else "later"


class CreateRoadmap(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    goal: str | None = Field(default=None, max_length=4000)
    repository_ids: list[uuid.UUID] = Field(min_length=1)


class UpdateRoadmap(CreateRoadmap):
    """Full edit — affects the *next* generated version, never the current one."""


class UpdateRoadmapItem(BaseModel):
    """Partial edit; only provided fields change. Status changes go through the transition
    table, priority/effort changes append events."""

    status: str | None = None
    urgent: bool | None = None
    important: bool | None = None
    effort: str | None = None
    milestone_id: uuid.UUID | None = None
    position: int | None = None
    title: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = None


class CreateItemDependency(BaseModel):
    depends_on_item_id: uuid.UUID


class RoadmapRepoRef(BaseModel):
    """The repo chip: enough to label and link an item's repository."""

    id: uuid.UUID
    slug: str
    owner: str
    name: str

    @classmethod
    def of(cls, row: RepositoryRow) -> RoadmapRepoRef:
        return cls(id=row.id, slug=f"{row.owner}/{row.name}", owner=row.owner, name=row.name)


class RoadmapVersionResult(BaseModel):
    id: uuid.UUID
    roadmap_id: uuid.UUID
    number: int
    status: str
    job_id: uuid.UUID | None
    error: str | None
    item_count: int
    duration_seconds: float | None
    created_at: datetime
    finished_at: datetime | None

    @classmethod
    def of(cls, row: RoadmapVersionRow, *, item_count: int = 0) -> RoadmapVersionResult:
        return cls(
            id=row.id,
            roadmap_id=row.roadmap_id,
            number=row.number,
            status=row.status,
            job_id=row.job_id,
            error=row.error,
            item_count=item_count,
            duration_seconds=row.duration_seconds,
            created_at=row.created_at,
            finished_at=row.finished_at,
        )


class RoadmapMilestoneResult(BaseModel):
    id: uuid.UUID
    position: int
    title: str
    summary: str | None

    @classmethod
    def of(cls, row: RoadmapMilestoneRow) -> RoadmapMilestoneResult:
        return cls(id=row.id, position=row.position, title=row.title, summary=row.summary)


class RoadmapExecutionResult(BaseModel):
    """One AI implementation run for an item (worktree → branch → push → PR)."""

    id: uuid.UUID
    item_id: uuid.UUID
    job_id: uuid.UUID | None
    status: str
    branch: str
    commit_sha: str | None
    pr_url: str | None
    pr_number: int | None
    pr_state: str | None
    agent_summary: str | None
    error: str | None
    total_cost_usd: float | None
    input_tokens: int | None
    output_tokens: int | None
    duration_seconds: float | None
    created_at: datetime
    finished_at: datetime | None

    @classmethod
    def of(cls, row: RoadmapExecutionRow) -> RoadmapExecutionResult:
        return cls(
            id=row.id,
            item_id=row.item_id,
            job_id=row.job_id,
            status=row.status,
            branch=row.branch,
            commit_sha=row.commit_sha,
            pr_url=row.pr_url,
            pr_number=row.pr_number,
            pr_state=row.pr_state,
            agent_summary=row.agent_summary,
            error=row.error,
            total_cost_usd=row.total_cost_usd,
            input_tokens=row.input_tokens,
            output_tokens=row.output_tokens,
            duration_seconds=row.duration_seconds,
            created_at=row.created_at,
            finished_at=row.finished_at,
        )


class RefreshPrsResult(BaseModel):
    """Outcome of a provider-side PR sweep: which items changed status."""

    checked: int
    updated_item_ids: list[uuid.UUID]


class RoadmapItemResult(BaseModel):
    id: uuid.UUID
    version_id: uuid.UUID
    milestone_id: uuid.UUID | None
    repository_id: uuid.UUID | None
    position: int
    slug: str
    title: str
    description: str | None
    rationale: str | None
    label: str
    urgent: bool
    important: bool
    quadrant: str
    effort: str | None
    status: str
    carried_over: bool
    issue_url: str | None
    # Items that must land before this one (ids within the same version).
    depends_on: list[uuid.UUID]
    # The newest execution (None when never dispatched) — the dialog's PR/job state.
    execution: RoadmapExecutionResult | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def of(
        cls,
        row: RoadmapItemRow,
        *,
        depends_on: list[uuid.UUID],
        execution: RoadmapExecutionRow | None = None,
    ) -> RoadmapItemResult:
        return cls(
            id=row.id,
            version_id=row.version_id,
            milestone_id=row.milestone_id,
            repository_id=row.repository_id,
            position=row.position,
            slug=row.slug,
            title=row.title,
            description=row.description,
            rationale=row.rationale,
            label=row.label,
            urgent=row.urgent,
            important=row.important,
            quadrant=quadrant_of(urgent=row.urgent, important=row.important),
            effort=row.effort,
            status=row.status,
            carried_over=row.carried_from_item_id is not None,
            issue_url=row.issue_url,
            depends_on=depends_on,
            execution=RoadmapExecutionResult.of(execution) if execution else None,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )


class RepoAssessmentResult(BaseModel):
    """One repo's health-radar scores from the generation output."""

    repo: str | None
    repository_id: uuid.UUID | None
    scores: dict[str, int]
    summary: str | None


class RoadmapResult(BaseModel):
    """The list-page row: identity + scope + current-version progress at a glance."""

    id: uuid.UUID
    name: str
    goal: str | None
    status: str
    repositories: list[RoadmapRepoRef]
    version_number: int | None
    # The newest version's lifecycle state — "pending" here is the list page's generating badge.
    generation_status: str | None
    items_total: int
    items_done: int
    created_at: datetime
    updated_at: datetime

    @classmethod
    def of(
        cls,
        row: RoadmapRow,
        *,
        repositories: list[RepositoryRow],
        version_number: int | None,
        generation_status: str | None,
        items_total: int,
        items_done: int,
    ) -> RoadmapResult:
        return cls(
            id=row.id,
            name=row.name,
            goal=row.goal,
            status=row.status,
            repositories=[RoadmapRepoRef.of(r) for r in repositories],
            version_number=version_number,
            generation_status=generation_status,
            items_total=items_total,
            items_done=items_done,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )


class RepoRoadmapSliceResult(BaseModel):
    """One roadmap as seen from a single repository: only that repo's items of the current
    version, with repo-scoped progress. The repository detail's `roadmaps` tab."""

    roadmap_id: uuid.UUID
    name: str
    goal: str | None
    status: str
    version_number: int | None
    # The newest version's lifecycle state — "pending" renders the generating badge.
    generation_status: str | None
    items_total: int
    items_done: int
    items: list[RoadmapItemResult]


class RoadmapDriftCheckResult(BaseModel):
    """One repository's drift run (pending until its engine job settles)."""

    id: uuid.UUID
    version_id: uuid.UUID
    repository_id: uuid.UUID
    job_id: uuid.UUID | None
    status: str
    error: str | None
    duration_seconds: float | None
    created_at: datetime
    finished_at: datetime | None

    @classmethod
    def of(cls, row: RoadmapDriftCheckRow) -> RoadmapDriftCheckResult:
        return cls(
            id=row.id,
            version_id=row.version_id,
            repository_id=row.repository_id,
            job_id=row.job_id,
            status=row.status,
            error=row.error,
            duration_seconds=row.duration_seconds,
            created_at=row.created_at,
            finished_at=row.finished_at,
        )


class RoadmapDriftFindingResult(BaseModel):
    """One item's drift verdict, awaiting an accept/dismiss decision."""

    id: uuid.UUID
    item_id: uuid.UUID
    item_title: str
    item_status: str
    verdict: str
    evidence: str | None
    status: str
    created_at: datetime
    decided_at: datetime | None

    @classmethod
    def of(cls, row: RoadmapDriftFindingRow, *, item: RoadmapItemRow) -> RoadmapDriftFindingResult:
        return cls(
            id=row.id,
            item_id=row.item_id,
            item_title=item.title,
            item_status=item.status,
            verdict=row.verdict,
            evidence=row.evidence,
            status=row.status,
            created_at=row.created_at,
            decided_at=row.decided_at,
        )


class RoadmapDriftStatusResult(BaseModel):
    """The drift tab's poll target: recent checks + every open finding."""

    checks: list[RoadmapDriftCheckResult]
    findings: list[RoadmapDriftFindingResult]


class ExportIssuesRequest(BaseModel):
    """Optional narrowing; default = every exportable item of the current version."""

    item_ids: list[uuid.UUID] | None = None
    statuses: list[str] | None = None


class ExportedIssueResult(BaseModel):
    item_id: uuid.UUID
    item_title: str
    issue_url: str | None
    skipped_reason: str | None


class ExportIssuesResult(BaseModel):
    created: int
    skipped: int
    items: list[ExportedIssueResult]


class RoadmapConfigResult(BaseModel):
    execution_timeout_seconds: float
    drift_cadence: str
    scheduler_enabled: bool
    updated_at: datetime


class UpdateRoadmapConfig(BaseModel):
    execution_timeout_seconds: float = Field(ge=60, le=7200)
    drift_cadence: str = Field(min_length=1, max_length=64)


class BurnupPoint(BaseModel):
    day: date
    total: int
    done: int


class BurnupResult(BaseModel):
    """Scope vs completion over time, aggregated from the item event log."""

    series: list[BurnupPoint]


class RadarResult(BaseModel):
    """The last two ready versions' per-repo assessments, for radar + trend."""

    current: list[RepoAssessmentResult]
    current_version: int | None
    previous: list[RepoAssessmentResult]
    previous_version: int | None


class RoadmapDetailResult(BaseModel):
    """The detail view: the current ready version's full plan, plus any in-flight generation.

    `version` is the ready version being rendered (None until the first generation lands).
    `generation` is the newest version when it is still pending or errored — the UI's
    generating/failed banner; None once it settles ready.
    Items are flat (each carries `milestone_id`) — the matrix, timeline and table are all
    client-side regroupings of one list.
    """

    id: uuid.UUID
    name: str
    goal: str | None
    status: str
    repositories: list[RoadmapRepoRef]
    version: RoadmapVersionResult | None
    generation: RoadmapVersionResult | None
    milestones: list[RoadmapMilestoneResult]
    items: list[RoadmapItemResult]
    assessments: list[RepoAssessmentResult]
    created_at: datetime
    updated_at: datetime
