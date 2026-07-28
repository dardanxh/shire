"""FastAPI routes for the Members context. HTTP concerns only — logic lives in the service."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.domain.members.schemas import (
    CreateMemberExclusion,
    MemberActivityResult,
    MemberDetailResult,
    MemberExclusionResult,
    MembersOverviewResult,
)
from shire.domain.members.services import MembersService

router = APIRouter(prefix="/members", tags=["members"])


@router.get("", response_model=MembersOverviewResult)
def members_overview(
    anonymize: bool = False, session: Session = Depends(get_session)
) -> MembersOverviewResult:
    """Fleet-wide members overview: portfolio health + aggregated identities.

    Pass `anonymize=true` to replace names/emails with stable pseudonyms for sharing.
    """
    return MembersService(session).overview(anonymize=anonymize)


@router.get("/exclusions", response_model=list[MemberExclusionResult])
def list_exclusions(session: Session = Depends(get_session)) -> list[MemberExclusionResult]:
    """User-managed opt-out / bot patterns applied on top of the built-in bot filters."""
    return MembersService(session).list_exclusions()


@router.post(
    "/exclusions",
    response_model=MemberExclusionResult,
    status_code=status.HTTP_201_CREATED,
)
def add_exclusion(
    body: CreateMemberExclusion, session: Session = Depends(get_session)
) -> MemberExclusionResult:
    """Exclude a member from every view (an email or a glob like `*[bot]*`)."""
    return MembersService(session).add_exclusion(body)


@router.delete("/exclusions/{exclusion_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_exclusion(
    exclusion_id: uuid.UUID, session: Session = Depends(get_session)
) -> None:
    MembersService(session).remove_exclusion(exclusion_id)


@router.get("/{identity_id}", response_model=MemberDetailResult)
def member_detail(
    identity_id: uuid.UUID, anonymize: bool = False, session: Session = Depends(get_session)
) -> MemberDetailResult:
    """One member's cross-repo breakdown (per-repo commits + churn)."""
    return MembersService(session).detail(identity_id, anonymize=anonymize)


@router.get("/{identity_id}/activity", response_model=MemberActivityResult)
def member_activity(
    identity_id: uuid.UUID, anonymize: bool = False, session: Session = Depends(get_session)
) -> MemberActivityResult:
    """One member's activity shape: weekly timeline, commit sizes, work pattern, repo shares.

    Built from per-commit records of each repo's latest analysis; repos analyzed before
    per-commit persistence are counted in `missing_data_repositories` until refreshed.
    """
    return MembersService(session).activity(identity_id, anonymize=anonymize)
