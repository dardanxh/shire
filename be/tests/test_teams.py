"""Teams CRUD + one-team-per-member assignment (SQLite-backed TeamsService)."""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from shire.core.exceptions import ConflictError, NotFoundError
from shire.domain.teams.models import TeamMembershipRow, TeamRow
from shire.domain.teams.schemas import (
    AssignMember,
    AssignMembersInput,
    CreateTeam,
    UpdateTeam,
)
from shire.domain.teams.services import TeamsService


@pytest.fixture
def session() -> Iterator[Session]:
    engine = create_engine("sqlite://")
    TeamRow.__table__.create(engine)
    TeamMembershipRow.__table__.create(engine)
    factory = sessionmaker(bind=engine)
    with factory() as s:
        yield s


def _member() -> AssignMember:
    return AssignMember(id=uuid.uuid4(), email="dev@example.com")


def test_create_assigns_palette_color_and_counts(session: Session) -> None:
    svc = TeamsService(session)
    a = svc.create(CreateTeam(name="Platform"))
    b = svc.create(CreateTeam(name="Growth"))
    assert a.color.startswith("#") and a.color != b.color  # cycled palette
    assert a.member_count == 0

    teams = {t.name: t for t in svc.list()}
    assert set(teams) == {"Platform", "Growth"}


def test_duplicate_name_conflicts(session: Session) -> None:
    svc = TeamsService(session)
    svc.create(CreateTeam(name="Platform"))
    with pytest.raises(ConflictError):
        svc.create(CreateTeam(name="platform"))  # case-insensitive clash


def test_assign_is_one_team_per_member_and_moves(session: Session) -> None:
    svc = TeamsService(session)
    a = svc.create(CreateTeam(name="A"))
    b = svc.create(CreateTeam(name="B"))
    member = _member()

    svc.assign_members(a.id, AssignMembersInput(members=[member]))
    assert svc.get(a.id).member_count == 1
    assert svc.membership_refs()[member.id].id == a.id

    # Re-assigning the same member to B moves them (unique member_id holds).
    detail_b = svc.assign_members(b.id, AssignMembersInput(members=[member]))
    assert detail_b.member_count == 1
    assert svc.get(a.id).member_count == 0
    assert svc.membership_refs()[member.id].id == b.id


def test_unassign_and_membership_refs(session: Session) -> None:
    svc = TeamsService(session)
    a = svc.create(CreateTeam(name="A"))
    member = _member()
    svc.assign_members(a.id, AssignMembersInput(members=[member]))

    svc.unassign_member(a.id, member.id)
    assert member.id not in svc.membership_refs()
    with pytest.raises(NotFoundError):
        svc.unassign_member(a.id, member.id)  # already gone


def test_update_rename_and_recolor(session: Session) -> None:
    svc = TeamsService(session)
    a = svc.create(CreateTeam(name="A", color="#111111"))
    updated = svc.update(a.id, UpdateTeam(name="Alpha", color="#222222"))
    assert updated.name == "Alpha"
    assert updated.color == "#222222"


def test_delete_removes_team(session: Session) -> None:
    svc = TeamsService(session)
    a = svc.create(CreateTeam(name="A"))
    svc.delete(a.id)
    assert svc.list() == []
    with pytest.raises(NotFoundError):
        svc.delete(a.id)
