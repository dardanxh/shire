"""Pydantic I/O schemas for the merge-review domain (Create / Result)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from shire.domain.merge_review.domain import (
    ClassificationLabel,
    Footprint,
    MrComment,
    RiskBreakdown,
)
from shire.domain.merge_review.models import (
    MergeReviewRow,
    MrHobitReviewRow,
    MrPrincipleCheckRow,
    MrRemarkRow,
)
from shire.domain.principles.models import PrincipleRow


class CreateMergeReview(BaseModel):
    """Create input: an ingested repository + a branch pair + the hobits acting as reviewers."""

    repository_id: uuid.UUID
    source_branch: str
    target_branch: str
    title: str | None = None
    hobit_slugs: list[str] = []


class MrHobitReviewResult(BaseModel):
    """One hobit's review of the diff (status drives the UI's per-card skeleton)."""

    hobit_slug: str
    hobit_name: str
    status: str
    headline: str | None
    self_score: int | None
    comments: list[MrComment]
    error: str | None
    duration_seconds: float | None
    started_at: datetime | None
    finished_at: datetime | None

    @classmethod
    def of(cls, row: MrHobitReviewRow, hobit_name: str) -> MrHobitReviewResult:
        return cls(
            hobit_slug=row.hobit_slug,
            hobit_name=hobit_name,
            status=row.status,
            headline=row.headline,
            self_score=row.self_score,
            comments=[MrComment.model_validate(c) for c in (row.comments or [])],
            error=row.error,
            duration_seconds=row.duration_seconds,
            started_at=row.started_at,
            finished_at=row.finished_at,
        )


class RunMrPrincipleChecks(BaseModel):
    """Which principles to judge this diff against.

    Omit `principle_ids` to run every enabled principle the repository is currently held to;
    pass an explicit list to run a subset. Never implicit — the caller always asks.
    """

    principle_ids: list[uuid.UUID] | None = None


class MrPrincipleCheckResult(BaseModel):
    """One principle's verdict about this MR's changes. Carries the principle's identity so the
    section renders standalone even if the principle is later unassigned from the repository."""

    principle_id: uuid.UUID
    principle_name: str
    severity: str
    statement: str
    status: str
    summary: str | None
    violations: list[dict]
    error: str | None
    duration_seconds: float | None
    finished_at: datetime | None

    @classmethod
    def of(cls, row: MrPrincipleCheckRow, principle: PrincipleRow) -> MrPrincipleCheckResult:
        return cls(
            principle_id=row.principle_id,
            principle_name=principle.name,
            severity=principle.severity,
            statement=principle.statement,
            status=row.status,
            summary=row.summary,
            violations=list(row.violations or []),
            error=row.error,
            duration_seconds=row.duration_seconds,
            finished_at=row.finished_at,
        )


class CreateMrRemark(BaseModel):
    """Star one finding for this MR — a snapshot of what was said, not a pointer to it.

    `source_ref` identifies what was starred (a hobit comment id, or a principle id with an
    optional violation index) so the UI can render the star as toggled and un-star it later.
    """

    source_kind: str  # "hobit" | "principle"
    source_ref: str
    source_label: str
    severity: str | None = None
    file: str | None = None
    line: int | None = None
    text: str


class MrRemarkResult(BaseModel):
    """One starred finding in the review's human-remarks tab."""

    id: uuid.UUID
    source_kind: str
    source_ref: str
    source_label: str
    severity: str | None
    file: str | None
    line: int | None
    text: str
    created_at: datetime

    @classmethod
    def of(cls, row: MrRemarkRow) -> MrRemarkResult:
        return cls(
            id=row.id,
            source_kind=row.source_kind,
            source_ref=row.source_ref,
            source_label=row.source_label,
            severity=row.severity,
            file=row.file,
            line=row.line,
            text=row.text,
            created_at=row.created_at,
        )


class TopFindingResult(BaseModel):
    """One entry of the "most important items" pane — a comment attributed to its hobit."""

    comment_id: str
    hobit_slug: str
    hobit_name: str
    severity: str
    file: str | None
    line: int | None
    body: str


class MergeReviewResult(BaseModel):
    """List-item shape: enough for tables and the polling predicate, no heavy payloads."""

    id: uuid.UUID
    repository_id: uuid.UUID
    repo_slug: str
    title: str | None
    source_branch: str
    target_branch: str
    overall_status: str
    footprint_status: str
    classification_status: str
    overview_status: str
    hobits_status: str
    risk_status: str
    size: str | None
    efficient: bool | None
    risk_score: int | None
    risk_verdict: str | None
    files_changed: int | None
    total_additions: int | None
    total_deletions: int | None
    created_at: datetime
    updated_at: datetime
    analyzed_at: datetime | None

    @classmethod
    def of(cls, row: MergeReviewRow, repo_slug: str) -> MergeReviewResult:
        return cls(**cls._base_fields(row, repo_slug))

    @staticmethod
    def _base_fields(row: MergeReviewRow, repo_slug: str) -> dict:
        fp = row.footprint or {}
        return {
            "id": row.id,
            "repository_id": row.repository_id,
            "repo_slug": repo_slug,
            "title": row.title,
            "source_branch": row.source_branch,
            "target_branch": row.target_branch,
            "overall_status": row.overall_status,
            "footprint_status": row.footprint_status,
            "classification_status": row.classification_status,
            "overview_status": row.overview_status,
            "hobits_status": row.hobits_status,
            "risk_status": row.risk_status,
            "size": fp.get("size"),
            "efficient": fp.get("efficient"),
            "risk_score": row.risk_score,
            "risk_verdict": row.risk_verdict,
            "files_changed": fp.get("files_changed"),
            "total_additions": fp.get("total_additions"),
            "total_deletions": fp.get("total_deletions"),
            "created_at": row.created_at,
            "updated_at": row.updated_at,
            "analyzed_at": row.analyzed_at,
        }


class MergeReviewDetailResult(MergeReviewResult):
    """The full review document — the detail page's single (polled) payload."""

    analyzed_source_sha: str | None
    analyzed_target_sha: str | None
    merge_base_sha: str | None
    footprint: Footprint | None
    classification: list[ClassificationLabel] | None
    overview_markdown: str | None
    risk_breakdown: RiskBreakdown | None
    selected_hobit_slugs: list[str]
    hobit_reviews: list[MrHobitReviewResult]
    top_findings: list[TopFindingResult]
    # On-demand, never populated by the analysis pipeline (see MrPrincipleCheckRow).
    principle_checks: list[MrPrincipleCheckResult]
    # The reader's starred findings — snapshots, so they survive re-runs.
    remarks: list[MrRemarkResult]
    # None = the source branch no longer resolves (deleted); True/False = moved / unchanged.
    stale: bool | None
    current_source_sha: str | None
    error: str | None

    @classmethod
    def of_detail(
        cls,
        row: MergeReviewRow,
        repo_slug: str,
        hobit_reviews: list[MrHobitReviewResult],
        top_findings: list[TopFindingResult],
        principle_checks: list[MrPrincipleCheckResult],
        remarks: list[MrRemarkResult],
        *,
        stale: bool | None,
        current_source_sha: str | None,
    ) -> MergeReviewDetailResult:
        return cls(
            **cls._base_fields(row, repo_slug),
            analyzed_source_sha=row.analyzed_source_sha,
            analyzed_target_sha=row.analyzed_target_sha,
            merge_base_sha=row.merge_base_sha,
            footprint=Footprint.model_validate(row.footprint) if row.footprint else None,
            classification=(
                [ClassificationLabel.model_validate(c) for c in row.classification]
                if row.classification is not None
                else None
            ),
            overview_markdown=row.overview_markdown,
            risk_breakdown=(
                RiskBreakdown.model_validate(row.risk_breakdown) if row.risk_breakdown else None
            ),
            selected_hobit_slugs=list(row.selected_hobit_slugs or []),
            hobit_reviews=hobit_reviews,
            top_findings=top_findings,
            principle_checks=principle_checks,
            remarks=remarks,
            stale=stale,
            current_source_sha=current_source_sha,
            error=row.error,
        )
