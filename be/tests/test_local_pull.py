"""Local-provider "Pull latest": the user's own checkout fast-forwards, but never unsafely."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest
from git import Repo

from shire.domain.repository.domain import GitProvider, RepoCoordinates
from shire.integrations.git_clone import GitCloneService

_ENV = {
    "PATH": "/usr/bin:/bin:/usr/local/bin",
    "GIT_AUTHOR_NAME": "Alice",
    "GIT_AUTHOR_EMAIL": "alice@example.com",
    "GIT_COMMITTER_NAME": "Alice",
    "GIT_COMMITTER_EMAIL": "alice@example.com",
}


def _git(cwd: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=cwd, check=True, env=_ENV)


@pytest.fixture
def upstream_and_checkout(tmp_path: Path) -> tuple[Path, Path]:
    """An "upstream" repo plus a clone of it — the shape a user's local checkout has."""
    upstream = tmp_path / "upstream"
    upstream.mkdir()
    _git(upstream, "init", "-q", "-b", "main")
    (upstream / "app.py").write_text("print(1)\n")
    _git(upstream, "add", ".")
    _git(upstream, "commit", "-q", "-m", "first")

    checkout = tmp_path / "checkout"
    _git(tmp_path, "clone", "-q", str(upstream), str(checkout))
    return upstream, checkout


def _new_upstream_commit(upstream: Path) -> str:
    (upstream / "feature.py").write_text("print(2)\n")
    _git(upstream, "add", ".")
    _git(upstream, "commit", "-q", "-m", "second")
    return Repo(upstream).head.commit.hexsha


def _pull(checkout: Path, *, pull: bool):
    coordinates = RepoCoordinates(provider=GitProvider.local, owner="me", name="repo")
    service = GitCloneService(checkout.parent / "clones")
    return service.clone(str(checkout), coordinates=coordinates, pull=pull)


def test_pull_fast_forwards_the_checkout(upstream_and_checkout: tuple[Path, Path]) -> None:
    upstream, checkout = upstream_and_checkout
    expected = _new_upstream_commit(upstream)

    outcome = _pull(checkout, pull=True)

    assert outcome.head_sha == expected
    assert Repo(checkout).head.commit.hexsha == expected
    assert (checkout / "feature.py").exists()


def test_without_pull_the_checkout_is_left_alone(
    upstream_and_checkout: tuple[Path, Path],
) -> None:
    """Ingest and scheduled runs adopt whatever is checked out — no fetch, no move."""
    upstream, checkout = upstream_and_checkout
    before = Repo(checkout).head.commit.hexsha
    _new_upstream_commit(upstream)

    outcome = _pull(checkout, pull=False)

    assert outcome.head_sha == before
    assert Repo(checkout).head.commit.hexsha == before


def test_pull_leaves_a_dirty_tree_untouched(upstream_and_checkout: tuple[Path, Path]) -> None:
    """Uncommitted work outranks the pull: analyze the current commit rather than move it."""
    upstream, checkout = upstream_and_checkout
    before = Repo(checkout).head.commit.hexsha
    _new_upstream_commit(upstream)
    (checkout / "app.py").write_text("print('work in progress')\n")

    outcome = _pull(checkout, pull=True)

    assert outcome.head_sha == before
    assert Repo(checkout).head.commit.hexsha == before
    assert (checkout / "app.py").read_text() == "print('work in progress')\n"


def test_pull_leaves_a_diverged_branch_untouched(
    upstream_and_checkout: tuple[Path, Path],
) -> None:
    """Local commits the upstream doesn't have: a fast-forward is impossible, so do nothing
    (never a merge commit or a rebase in the user's tree)."""
    upstream, checkout = upstream_and_checkout
    _new_upstream_commit(upstream)
    (checkout / "local.py").write_text("print(3)\n")
    _git(checkout, "add", ".")
    _git(checkout, "commit", "-q", "-m", "local work")
    before = Repo(checkout).head.commit.hexsha

    outcome = _pull(checkout, pull=True)

    assert outcome.head_sha == before
    assert Repo(checkout).head.commit.hexsha == before
