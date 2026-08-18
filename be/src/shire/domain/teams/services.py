"""Teams service: CRUD for teams plus one-team-per-member assignment.

A pure grouping domain — it never reads Members/substrate, so nothing here depends on those
contexts (Members depends on Teams, not the other way round). `membership_refs()` is the read seam
Members uses to tint people by their team.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from shire.core.exceptions import ConflictError, NotFoundError
from shire.domain.teams.models import TeamMembershipRow, TeamRow
from shire.domain.teams.repositories import (
    SqlTeamMembershipRepository,
    SqlTeamRepository,
)
from shire.domain.teams.schemas import (
    AssignMembersInput,
    CreateTeam,
    TeamDetailResult,
    TeamMemberResult,
    TeamRefResult,
    TeamResult,
    UpdateTeam,
)

# A calm, distinct palette cycled by team count when the caller doesn't pick a color.
_PALETTE = (
    "#2563eb",  # blue
    "#16a34a",  # green
    "#db2777",  # pink
    "#f59e0b",  # amber
    "#7c3aed",  # violet
    "#0891b2",  # cyan
    "#dc2626",  # red
    "#65a30d",  # lime
    "#c026d3",  # fuchsia
    "#0d9488",  # teal
)


class TeamsService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._teams = SqlTeamRepository(session)
        self._memberships = SqlTeamMembershipRepository(session)

    # --- reads ----------------------------------------------------------------
    def list(self) -> list[TeamResult]:
        counts = self._memberships.counts_by_team()
        return [self._to_result(t, counts.get(t.id, 0)) for t in self._teams.list_all()]

    def get(self, team_id: uuid.UUID) -> TeamDetailResult:
        team = self._require(team_id)
        members = self._memberships.list_for_team(team_id)
        return TeamDetailResult(
            id=team.id,
            name=team.name,
            color=team.color,
            description=team.description,
            member_count=len(members),
            created_at=team.created_at,
            members=[
                TeamMemberResult(member_id=m.member_id, email=m.member_email) for m in members
            ],
        )

    def membership_refs(self) -> dict[uuid.UUID, TeamRefResult]:
        """member_id -> its team ref. The seam Members reads to color people by team."""
        teams = {t.id: t for t in self._teams.list_all()}
        refs: dict[uuid.UUID, TeamRefResult] = {}
        for m in self._memberships.list_all():
            team = teams.get(m.team_id)
            if team is not None:
                refs[m.member_id] = TeamRefResult(id=team.id, name=team.name, color=team.color)
        return refs

    # --- writes ---------------------------------------------------------------
    def create(self, body: CreateTeam) -> TeamResult:
        name = body.name.strip()
        if not name:
            raise ConflictError("Team name cannot be empty.")
        if self._teams.get_by_name(name) is not None:
            raise ConflictError(f"A team named '{name}' already exists.")
        color = (body.color or "").strip() or _PALETTE[self._teams.count() % len(_PALETTE)]
        team = TeamRow(
            id=uuid.uuid4(),
            name=name,
            color=color,
            description=(body.description or None),
            created_at=datetime.now(UTC),
        )
        self._teams.add(team)
        self._session.flush()
        return self._to_result(team, 0)

    def update(self, team_id: uuid.UUID, body: UpdateTeam) -> TeamResult:
        team = self._require(team_id)
        if body.name is not None:
            name = body.name.strip()
            if not name:
                raise ConflictError("Team name cannot be empty.")
            existing = self._teams.get_by_name(name)
            if existing is not None and existing.id != team_id:
                raise ConflictError(f"A team named '{name}' already exists.")
            team.name = name
        if body.color is not None and body.color.strip():
            team.color = body.color.strip()
        if body.description is not None:
            team.description = body.description or None
        self._session.flush()
        counts = self._memberships.counts_by_team()
        return self._to_result(team, counts.get(team_id, 0))

    def delete(self, team_id: uuid.UUID) -> None:
        if not self._teams.delete(team_id):
            raise NotFoundError("No team with that id.")

    def assign_members(self, team_id: uuid.UUID, body: AssignMembersInput) -> TeamDetailResult:
        self._require(team_id)
        now = datetime.now(UTC)
        # Move each member here: drop any prior membership first so the unique member_id holds.
        for member in body.members:
            self._memberships.delete_by_member(member.id)
        self._session.flush()
        for member in body.members:
            self._memberships.add(
                TeamMembershipRow(
                    id=uuid.uuid4(),
                    team_id=team_id,
                    member_id=member.id,
                    member_email=member.email.strip().lower(),
                    created_at=now,
                )
            )
        self._session.flush()
        return self.get(team_id)

    def unassign_member(self, team_id: uuid.UUID, member_id: uuid.UUID) -> None:
        self._require(team_id)
        if not self._memberships.delete(team_id, member_id):
            raise NotFoundError("That member is not on this team.")

    # --- internals ------------------------------------------------------------
    def _require(self, team_id: uuid.UUID) -> TeamRow:
        team = self._teams.get(team_id)
        if team is None:
            raise NotFoundError("No team with that id.")
        return team

    @staticmethod
    def _to_result(team: TeamRow, member_count: int) -> TeamResult:
        return TeamResult(
            id=team.id,
            name=team.name,
            color=team.color,
            description=team.description,
            member_count=member_count,
            created_at=team.created_at,
        )
