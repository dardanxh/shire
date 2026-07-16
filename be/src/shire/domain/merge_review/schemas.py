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
from shire.domain.merge_review.models import MergeReviewRow, MrHobitReviewRow


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
            finished_at=row.finished_at,
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
            stale=stale,
            current_source_sha=current_source_sha,
            error=row.error,
        )
