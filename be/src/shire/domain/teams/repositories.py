"""Data access for teams and team memberships."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from shire.domain.teams.models import TeamMembershipRow, TeamRow


class SqlTeamRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_all(self) -> list[TeamRow]:
        return list(self._session.scalars(select(TeamRow).order_by(TeamRow.name)))

    def get(self, team_id: uuid.UUID) -> TeamRow | None:
        return self._session.get(TeamRow, team_id)

    def get_by_name(self, name: str) -> TeamRow | None:
        return self._session.scalars(
            select(TeamRow).where(func.lower(TeamRow.name) == name.lower())
        ).first()

    def count(self) -> int:
        return self._session.scalar(select(func.count()).select_from(TeamRow)) or 0

    def add(self, row: TeamRow) -> None:
        self._session.add(row)

    def delete(self, team_id: uuid.UUID) -> bool:
        row = self._session.get(TeamRow, team_id)
        if row is None:
            return False
        self._session.delete(row)
        return True


class SqlTeamMembershipRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_all(self) -> list[TeamMembershipRow]:
        return list(self._session.scalars(select(TeamMembershipRow)))

    def list_for_team(self, team_id: uuid.UUID) -> list[TeamMembershipRow]:
        return list(
            self._session.scalars(
                select(TeamMembershipRow)
                .where(TeamMembershipRow.team_id == team_id)
                .order_by(TeamMembershipRow.member_email)
            )
        )

    def get_by_member(self, member_id: uuid.UUID) -> TeamMembershipRow | None:
        return self._session.scalars(
            select(TeamMembershipRow).where(TeamMembershipRow.member_id == member_id)
        ).first()

    def counts_by_team(self) -> dict[uuid.UUID, int]:
        rows = self._session.execute(
            select(TeamMembershipRow.team_id, func.count()).group_by(TeamMembershipRow.team_id)
        ).all()
        return dict(rows)

    def add(self, row: TeamMembershipRow) -> None:
        self._session.add(row)

    def delete_by_member(self, member_id: uuid.UUID) -> None:
        row = self.get_by_member(member_id)
        if row is not None:
            self._session.delete(row)

    def delete(self, team_id: uuid.UUID, member_id: uuid.UUID) -> bool:
        row = self.get_by_member(member_id)
        if row is None or row.team_id != team_id:
            return False
        self._session.delete(row)
        return True
