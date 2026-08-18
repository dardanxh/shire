"""FastAPI routes for the Members context. HTTP concerns only — logic lives in the service."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.domain.members.schemas import (
    ContributionsGraphResult,
    CreateMemberExclusion,
    CreateMemberMerge,
    MemberActivityResult,
    MemberDetailResult,
    MemberExclusionResult,
    MemberMergeResult,
    MembersOverviewResult,
    TeamContributionsResult,
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


@router.get("/merges", response_model=list[MemberMergeResult])
def list_merges(session: Session = Depends(get_session)) -> list[MemberMergeResult]:
    """Identity merges: alias emails folded into a primary identity."""
    return MembersService(session).list_merges()


@router.post(
    "/merges",
    response_model=list[MemberMergeResult],
    status_code=status.HTTP_201_CREATED,
)
def add_merges(
    body: CreateMemberMerge, session: Session = Depends(get_session)
) -> list[MemberMergeResult]:
    """Merge identities: fold each alias email's contributions into the primary email."""
    return MembersService(session).add_merges(body)


@router.delete("/merges/{merge_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_merge(merge_id: uuid.UUID, session: Session = Depends(get_session)) -> None:
    MembersService(session).remove_merge(merge_id)


@router.get("/contributions-graph", response_model=ContributionsGraphResult)
def contributions_graph(
    team_id: uuid.UUID | None = None,
    include_subrepos: bool = True,
    anonymize: bool = False,
    session: Session = Depends(get_session),
) -> ContributionsGraphResult:
    """Members ↔ repositories graph, edges weighted by commits.

    `team_id` narrows to one team; `include_subrepos=false` folds monorepo subpaths into their
    family root. Declared before `/{identity_id}` so the literal path wins the match.
    """
    return MembersService(session).contributions_graph(
        team_id=team_id, include_subrepos=include_subrepos, anonymize=anonymize
    )


@router.get("/team-contributions", response_model=TeamContributionsResult)
def team_contributions(
    session: Session = Depends(get_session),
) -> TeamContributionsResult:
    """Which teams publish the most commits across tracked repositories (+ Unassigned bucket)."""
    return MembersService(session).team_contributions()


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
