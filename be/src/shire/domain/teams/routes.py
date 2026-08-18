"""FastAPI routes for the Teams context. HTTP concerns only — logic lives in the service."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.domain.teams.schemas import (
    AssignMembersInput,
    CreateTeam,
    TeamDetailResult,
    TeamResult,
    UpdateTeam,
)
from shire.domain.teams.services import TeamsService

router = APIRouter(prefix="/teams", tags=["teams"])


@router.get("", response_model=list[TeamResult])
def list_teams(session: Session = Depends(get_session)) -> list[TeamResult]:
    """Every team with its member count."""
    return TeamsService(session).list()


@router.post("", response_model=TeamResult, status_code=status.HTTP_201_CREATED)
def create_team(body: CreateTeam, session: Session = Depends(get_session)) -> TeamResult:
    return TeamsService(session).create(body)


@router.get("/{team_id}", response_model=TeamDetailResult)
def get_team(team_id: uuid.UUID, session: Session = Depends(get_session)) -> TeamDetailResult:
    return TeamsService(session).get(team_id)


@router.patch("/{team_id}", response_model=TeamResult)
def update_team(
    team_id: uuid.UUID, body: UpdateTeam, session: Session = Depends(get_session)
) -> TeamResult:
    return TeamsService(session).update(team_id, body)


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team(team_id: uuid.UUID, session: Session = Depends(get_session)) -> None:
    TeamsService(session).delete(team_id)


@router.post("/{team_id}/members", response_model=TeamDetailResult)
def assign_members(
    team_id: uuid.UUID,
    body: AssignMembersInput,
    session: Session = Depends(get_session),
) -> TeamDetailResult:
    """Assign (or move) members into this team. A member belongs to at most one team."""
    return TeamsService(session).assign_members(team_id, body)


@router.delete("/{team_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def unassign_member(
    team_id: uuid.UUID,
    member_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> None:
    TeamsService(session).unassign_member(team_id, member_id)
