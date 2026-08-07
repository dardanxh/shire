"""FastAPI routes for the merge-review domain. HTTP concerns only — logic lives in the service.

No prefix on the router: it serves both `/merge-reviews/...` and the repo-scoped list at
`/repositories/{id}/merge-reviews` (the repository page's MRs tab).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.core.pagination import Page, PaginationParams
from shire.domain.merge_review.schemas import (
    CreateMergeReview,
    MergeReviewDetailResult,
    MergeReviewResult,
    RunMrPrincipleChecks,
)
from shire.domain.merge_review.services import MergeReviewService

router = APIRouter(tags=["merge-reviews"])


@router.post(
    "/merge-reviews", response_model=MergeReviewDetailResult, status_code=status.HTTP_201_CREATED
)
def create_merge_review(
    body: CreateMergeReview, session: Session = Depends(get_session)
) -> MergeReviewDetailResult:
    """Create a review: the git footprint is computed synchronously (returned immediately);
    the AI sections run in the background — poll the detail endpoint."""
    return MergeReviewService(session).create(body)


@router.get("/merge-reviews", response_model=Page[MergeReviewResult])
def list_merge_reviews(
    repository_id: uuid.UUID | None = None,
    params: PaginationParams = Depends(),
    session: Session = Depends(get_session),
) -> Page[MergeReviewResult]:
    return MergeReviewService(session).list(params, repository_id)


@router.get("/repositories/{repository_id}/merge-reviews", response_model=Page[MergeReviewResult])
def list_repository_merge_reviews(
    repository_id: uuid.UUID,
    params: PaginationParams = Depends(),
    session: Session = Depends(get_session),
) -> Page[MergeReviewResult]:
    """The reviews analyzed in this platform for one repository (the repo page's MRs tab)."""
    return MergeReviewService(session).list(params, repository_id)


@router.get("/merge-reviews/{review_id}", response_model=MergeReviewDetailResult)
def get_merge_review(
    review_id: uuid.UUID, session: Session = Depends(get_session)
) -> MergeReviewDetailResult:
    """The full review document (the UI's poll target while sections are pending/running)."""
    return MergeReviewService(session).get(review_id)


@router.post("/merge-reviews/{review_id}/reanalyze", response_model=MergeReviewDetailResult)
def reanalyze_merge_review(
    review_id: uuid.UUID, session: Session = Depends(get_session)
) -> MergeReviewDetailResult:
    """Re-run the whole analysis against the branches' current heads (409 while one is running)."""
    return MergeReviewService(session).reanalyze(review_id)


@router.post(
    "/merge-reviews/{review_id}/principle-checks",
    response_model=MergeReviewDetailResult,
    status_code=status.HTTP_202_ACCEPTED,
)
def run_merge_review_principle_checks(
    review_id: uuid.UUID,
    body: RunMrPrincipleChecks,
    session: Session = Depends(get_session),
) -> MergeReviewDetailResult:
    """Judge this MR's changes against its repository's principles — one engine job each.

    Explicitly triggered; the analysis pipeline never runs these. Returns the review with the
    checks back as `pending`, which the detail poll then settles. 409 when the review has no
    footprint yet, the repo has no clone, or the requested checks are already running.
    """
    return MergeReviewService(session).run_principle_checks(review_id, body)


@router.delete("/merge-reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_merge_review(review_id: uuid.UUID, session: Session = Depends(get_session)) -> None:
    MergeReviewService(session).delete(review_id)
