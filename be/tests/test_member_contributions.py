"""Contributions graph + team dashboard aggregation logic (no DB — `_aggregate`/teams stubbed)."""

from __future__ import annotations

import uuid

from shire.domain.members.services import MembersService, _Aggregate
from shire.domain.teams.schemas import TeamRefResult

# Stable ids for the fixture graph.
ALICE = uuid.uuid4()
BOB = uuid.uuid4()
CAROL = uuid.uuid4()
REPO_API = uuid.uuid4()
REPO_WEB_ROOT = uuid.uuid4()
REPO_WEB_UI = uuid.uuid4()

PLATFORM = TeamRefResult(id=uuid.uuid4(), name="Platform", color="#2563eb")


def _repo(name: str, slug: str, family: str, subpath: str, commits: int) -> dict:
    return {
        "name": name,
        "slug": slug,
        "family": family,
        "subpath": subpath,
        "commits": commits,
        "lines_added": 0,
        "lines_removed": 0,
        "files_touched": 0,
        "sole": False,
    }


def _agg(identity: uuid.UUID, name: str, repos: dict[uuid.UUID, dict]) -> _Aggregate:
    agg = _Aggregate(identity, f"{name.lower()}@example.com")
    agg.add_name(name)
    agg.repositories = repos
    agg.commits = sum(r["commits"] for r in repos.values())
    return agg


def _service() -> MembersService:
    svc = MembersService.__new__(MembersService)  # skip DB __init__

    aggregates = {
        ALICE: _agg(
            ALICE,
            "Alice",
            {
                REPO_API: _repo("acme/api", "acme/api", "github/acme/api", "", 10),
                REPO_WEB_UI: _repo("acme/webapp", "acme/webapp/ui", "github/acme/webapp", "ui", 5),
            },
        ),
        BOB: _agg(
            BOB,
            "Bob",
            {REPO_API: _repo("acme/api", "acme/api", "github/acme/api", "", 3)},
        ),
        CAROL: _agg(
            CAROL,
            "Carol",
            {REPO_WEB_ROOT: _repo("acme/webapp", "acme/webapp", "github/acme/webapp", "", 7)},
        ),
    }
    svc._aggregate = lambda: (aggregates, 3, 0)  # type: ignore[method-assign]

    class _Teams:
        def membership_refs(self) -> dict[uuid.UUID, TeamRefResult]:
            return {ALICE: PLATFORM, BOB: PLATFORM}

    svc._teams = _Teams()  # type: ignore[assignment]
    return svc


def test_graph_edges_weighted_by_commits() -> None:
    graph = _service().contributions_graph(include_subrepos=True)

    members = {m.name: m for m in graph.members}
    assert members["Alice"].commits == 15
    assert members["Alice"].team == PLATFORM
    assert members["Carol"].team is None

    # Subrepos kept: three distinct repo nodes.
    assert len(graph.repositories) == 3
    edges = {(e.member_id, e.repository_id): e.commits for e in graph.edges}
    assert edges[(ALICE, str(REPO_API))] == 10
    assert edges[(ALICE, str(REPO_WEB_UI))] == 5
    assert edges[(BOB, str(REPO_API))] == 3
    # Repo node total sums both contributors.
    api = next(r for r in graph.repositories if r.id == str(REPO_API))
    assert api.commits == 13
    # Legend carries the one team present.
    assert graph.teams == [PLATFORM]


def test_graph_folds_subrepos_into_family() -> None:
    graph = _service().contributions_graph(include_subrepos=False)

    # webapp root + webapp/ui collapse to a single family node.
    assert len(graph.repositories) == 2
    assert all(r.id.startswith("family:") for r in graph.repositories)
    web = next(r for r in graph.repositories if r.family == "github/acme/webapp")
    assert web.name == "acme/webapp"
    assert web.commits == 12  # Alice ui(5) + Carol root(7)


def test_graph_team_filter() -> None:
    graph = _service().contributions_graph(team_id=PLATFORM.id, include_subrepos=True)
    assert {m.name for m in graph.members} == {"Alice", "Bob"}
    # Carol's repo (only she touched it) drops out entirely.
    assert all(r.id != str(REPO_WEB_ROOT) for r in graph.repositories)


def test_team_contributions_buckets_and_unassigned() -> None:
    result = _service().team_contributions()

    assert result.total_commits == 25  # 15 + 3 + 7
    platform = result.teams[0]
    assert platform.team == PLATFORM
    assert platform.total_commits == 18  # Alice 15 + Bob 3
    assert platform.member_count == 2
    assert platform.repository_count == 2  # api + webapp/ui

    unassigned = result.teams[-1]
    assert unassigned.team is None
    assert unassigned.total_commits == 7
    assert round(platform.share, 2) == 0.72
