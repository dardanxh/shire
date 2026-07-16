"""Merge-review service: synchronous footprint + CRUD, with AI sections delegated to the
engine job chain.

`create`/`reanalyze` compute the git footprint inline (seconds), persist the review with its AI
sections pending, and enqueue the first analysis job — so the response carries the footprint
instantly and the UI polls `get` while the engine service fills the AI sections in (see jobs.py).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.orm import Session

from shire.core.exceptions import ConflictError, NotFoundError, ValidationError
from shire.core.pagination import Page, PaginationParams
from shire.domain.connections.domain import GitProvider
from shire.domain.hobits.services import HobitService
from shire.domain.merge_review.domain import CommentSeverity, Footprint, MrComment
from shire.domain.merge_review.jobs import enqueue_classification
from shire.domain.merge_review.models import MergeReviewRow
from shire.domain.merge_review.repositories import (
    SqlMergeReviewRepository,
    SqlMrHobitReviewRepository,
)
from shire.domain.merge_review.schemas import (
    CreateMergeReview,
    MergeReviewDetailResult,
    MergeReviewResult,
    MrHobitReviewResult,
    TopFindingResult,
)
from shire.domain.repository.domain import Repository
from shire.domain.repository.repositories import SqlRepositoryRepository
from shire.domain.substrate.services import AnalysisService
from shire.integrations.git_diff import (
    BranchNotFoundError,
    UnrelatedHistoriesError,
    compute_footprint,
    rev_of_branch,
)

_SEVERITY_RANK = {
    CommentSeverity.critical: 0,
    CommentSeverity.major: 1,
    CommentSeverity.minor: 2,
    CommentSeverity.info: 3,
}
_TOP_FINDINGS_LIMIT = 10


class MergeReviewService:
    """Business logic for merge reviews. Constructed per request from a DB session."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._reviews = SqlMergeReviewRepository(session)
        self._hobit_reviews = SqlMrHobitReviewRepository(session)
        self._repos = SqlRepositoryRepository(session)
        self._hobits = HobitService(session)
        self._analysis = AnalysisService(session)

    # --- writes ---------------------------------------------------------------
    def create(self, data: CreateMergeReview) -> MergeReviewDetailResult:
        repo = self._require_repo(data.repository_id)
        self._validate(repo, data.source_branch, data.target_branch, data.hobit_slugs)
        footprint = self._footprint(repo, data.source_branch, data.target_branch)

        now = datetime.now(UTC)
        row = MergeReviewRow(
            repository_id=repo.id,
            title=data.title,
            source_branch=data.source_branch,
            target_branch=data.target_branch,
            analyzed_source_sha=footprint.source_sha,
            analyzed_target_sha=footprint.target_sha,
            merge_base_sha=footprint.merge_base_sha,
            footprint=footprint.model_dump(mode="json"),
            footprint_status="completed",
            selected_hobit_slugs=list(data.hobit_slugs),
            created_at=now,
            updated_at=now,
        )
        self._reviews.add(row)
        self._hobit_reviews.replace_for_review(row.id, data.hobit_slugs)
        review_id = row.id

        # Enqueue inside this transaction: the job row and its NOTIFY become visible to the
        # engine service atomically with the review itself.
        enqueue_classification(self._session, review_id)
        self._session.commit()
        return self.get(review_id)

    def reanalyze(self, review_id: uuid.UUID) -> MergeReviewDetailResult:
        row = self._require_review(review_id)
        repo = self._require_repo(row.repository_id)
        if not self._reviews.try_reset(review_id):
            raise ConflictError("An analysis is already running for this review")

        footprint = self._footprint(repo, row.source_branch, row.target_branch)
        row.analyzed_source_sha = footprint.source_sha
        row.analyzed_target_sha = footprint.target_sha
        row.merge_base_sha = footprint.merge_base_sha
        row.footprint = footprint.model_dump(mode="json")
        row.footprint_status = "completed"
        row.classification = None
        row.classification_status = "pending"
        row.overview_markdown = None
        row.overview_status = "pending"
        row.risk_score = None
        row.risk_breakdown = None
        row.risk_verdict = None
        row.risk_status = "pending"
        row.hobits_status = "pending"
        row.error = None
        row.analyzed_at = None
        row.updated_at = datetime.now(UTC)
        self._hobit_reviews.replace_for_review(review_id, list(row.selected_hobit_slugs or []))

        enqueue_classification(self._session, review_id)
        self._session.commit()
        return self.get(review_id)

    def delete(self, review_id: uuid.UUID) -> None:
        self._require_review(review_id)
        self._reviews.delete(review_id)

    # --- reads ----------------------------------------------------------------
    def get(self, review_id: uuid.UUID) -> MergeReviewDetailResult:
        row = self._require_review(review_id)
        repo = self._require_repo(row.repository_id)

        current_sha = self._current_source_sha(repo, row.source_branch)
        stale = (
            None
            if current_sha is None or row.analyzed_source_sha is None
            else current_sha != row.analyzed_source_sha
        )

        reviews = [
            MrHobitReviewResult.of(r, self._hobit_name(r.hobit_slug))
            for r in self._hobit_reviews.list_for_review(review_id)
        ]
        return MergeReviewDetailResult.of_detail(
            row,
            repo.coordinates.slug,
            reviews,
            _top_findings(reviews),
            stale=stale,
            current_source_sha=current_sha,
        )

    def list(
        self, params: PaginationParams, repository_id: uuid.UUID | None = None
    ) -> Page[MergeReviewResult]:
        total = self._reviews.count(repository_id=repository_id)
        rows = self._reviews.list(
            repository_id=repository_id, limit=params.limit, offset=params.offset
        )
        slugs: dict[uuid.UUID, str] = {}
        items: list[MergeReviewResult] = []
        for row in rows:
            if row.repository_id not in slugs:
                repo = self._repos.get(row.repository_id)
                slugs[row.repository_id] = repo.coordinates.slug if repo else "unknown"
            items.append(MergeReviewResult.of(row, slugs[row.repository_id]))
        return Page.create(items, total, params)

    # --- internals ------------------------------------------------------------
    def _require_review(self, review_id: uuid.UUID) -> MergeReviewRow:
        row = self._reviews.get(review_id)
        if row is None:
            raise NotFoundError("Merge review not found")
        return row

    def _require_repo(self, repository_id: uuid.UUID) -> Repository:
        repo = self._repos.get(repository_id)
        if repo is None:
            raise NotFoundError("Repository not found")
        return repo

    def _validate(self, repo: Repository, source: str, target: str, hobit_slugs: list[str]) -> None:
        if not repo.clone_path or not Path(repo.clone_path).is_dir():
            raise ConflictError("Repository has not been cloned yet")
        if source.strip() == target.strip():
            raise ValidationError("Source and target branch must differ")
        unknown = [s for s in hobit_slugs if self._hobits.resolve_spec(s) is None]
        if unknown:
            raise ValidationError(f"Unknown hobit(s): {', '.join(unknown)}")

    def _footprint(self, repo: Repository, source: str, target: str) -> Footprint:
        try:
            footprint = compute_footprint(
                repo.clone_path,
                source,
                target,
                provider_is_local=repo.coordinates.provider is GitProvider.local,
            )
        except BranchNotFoundError as exc:
            raise ConflictError(str(exc)) from exc
        except UnrelatedHistoriesError as exc:
            raise ConflictError(str(exc)) from exc

        hotspots = self._hotspot_paths(repo.id)
        touched = [f.path for f in footprint.files if f.path in hotspots]
        for f in footprint.files:
            f.is_hotspot = f.path in hotspots
        footprint.hotspot_paths_touched = touched
        return footprint

    def _hotspot_paths(self, repository_id: uuid.UUID) -> set[str]:
        try:
            analysis = self._analysis.latest_result(repository_id)
        except NotFoundError:
            return set()
        return {h.path for h in analysis.hotspots}

    def _current_source_sha(self, repo: Repository, source_branch: str) -> str | None:
        if not repo.clone_path or not Path(repo.clone_path).is_dir():
            return None
        return rev_of_branch(
            repo.clone_path,
            source_branch,
            provider_is_local=repo.coordinates.provider is GitProvider.local,
        )

    def _hobit_name(self, slug: str) -> str:
        spec = self._hobits.resolve_spec(slug)
        return spec.name if spec is not None else slug


def _top_findings(reviews: list[MrHobitReviewResult]) -> list[TopFindingResult]:
    """The "most important items" pane: every comment from completed reviews, worst first."""
    entries: list[tuple[int, int, MrComment, MrHobitReviewResult]] = []
    for review in reviews:
        if review.status != "completed":
            continue
        for comment in review.comments:
            entries.append(
                (_SEVERITY_RANK[comment.severity], -(review.self_score or 0), comment, review)
            )
    entries.sort(key=lambda e: (e[0], e[1]))
    return [
        TopFindingResult(
            comment_id=comment.id,
            hobit_slug=review.hobit_slug,
            hobit_name=review.hobit_name,
            severity=comment.severity.value,
            file=comment.file,
            line=comment.line,
            body=comment.body,
        )
        for _, _, comment, review in entries[:_TOP_FINDINGS_LIMIT]
    ]
