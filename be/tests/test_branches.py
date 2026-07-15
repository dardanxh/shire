"""Integration test: build a real temp git repo and inspect its branches offline."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from hobits.domain.repository.domain import BranchStatus
from hobits.integrations.git_branches import inspect_branches


def _git(cwd: Path, *args: str, date: str = "2026-07-01T12:00:00", author: str = "Alice") -> None:
    env = {
        "GIT_AUTHOR_NAME": author,
        "GIT_AUTHOR_EMAIL": f"{author.lower()}@example.com",
        "GIT_COMMITTER_NAME": author,
        "GIT_COMMITTER_EMAIL": f"{author.lower()}@example.com",
        "GIT_AUTHOR_DATE": date,
        "GIT_COMMITTER_DATE": date,
    }
    subprocess.run(["git", *args], cwd=cwd, check=True, env={"PATH": "/usr/bin:/bin", **env})


@pytest.fixture
def branchy_repo(tmp_path: Path) -> Path:
    """main + four branches: truly merged, squash-merged, open (active), and stale."""
    repo = tmp_path / "branchy"
    repo.mkdir()
    _git(repo, "init", "-q", "-b", "main")

    (repo / "a.txt").write_text("base\n")
    _git(repo, "add", ".")
    _git(repo, "commit", "-q", "-m", "base", date="2026-06-01T12:00:00")

    # Truly merged: merge commit on main, branch tip becomes an ancestor.
    _git(repo, "checkout", "-q", "-b", "feature-merged")
    (repo / "b.txt").write_text("merged work\n")
    _git(repo, "add", ".")
    _git(repo, "commit", "-q", "-m", "merged work", date="2026-06-02T12:00:00")
    _git(repo, "checkout", "-q", "main")
    _git(
        repo,
        "merge",
        "-q",
        "--no-ff",
        "-m",
        "merge feature",
        "feature-merged",
        date="2026-06-03T12:00:00",
    )

    # Squash-merged: two commits squashed into one commit on main; tip is NOT an ancestor.
    _git(repo, "checkout", "-q", "-b", "feature-squashed")
    (repo / "c.txt").write_text("squash one\n")
    _git(repo, "add", ".")
    _git(repo, "commit", "-q", "-m", "squash one", date="2026-06-04T12:00:00")
    (repo / "c.txt").write_text("squash one\nsquash two\n")
    _git(repo, "add", ".")
    _git(repo, "commit", "-q", "-m", "squash two", date="2026-06-05T12:00:00")
    _git(repo, "checkout", "-q", "main")
    _git(repo, "merge", "--squash", "-q", "feature-squashed")
    _git(repo, "commit", "-q", "-m", "squashed feature", date="2026-06-06T12:00:00")

    # Open branch: recent unmerged work by a second identity.
    _git(repo, "checkout", "-q", "-b", "feature-open")
    (repo / "d.txt").write_text("open work\n")
    _git(repo, "add", ".")
    _git(repo, "commit", "-q", "-m", "open work", date="2026-07-10T12:00:00", author="Bob")
    _git(repo, "checkout", "-q", "main")

    # Stale branch: unmerged and last touched years ago.
    _git(repo, "checkout", "-q", "-b", "old-experiment")
    (repo / "e.txt").write_text("ancient\n")
    _git(repo, "add", ".")
    _git(repo, "commit", "-q", "-m", "ancient", date="2020-01-01T12:00:00")
    _git(repo, "checkout", "-q", "main")

    return repo


def test_inspect_branches(branchy_repo: Path) -> None:
    result = inspect_branches(branchy_repo, "main", provider_is_local=True)

    assert result.total_branches == 5
    assert result.fetched is False  # local repos never fetch
    assert result.truncated is False
    assert result.merged_count == 1  # ancestor check counts only the true merge
    assert result.stale_count == 1  # old-experiment (squash branch is recent, just unmerged)

    by_name = {b.name: b for b in result.branches}
    assert set(by_name) == {
        "main",
        "feature-merged",
        "feature-squashed",
        "feature-open",
        "old-experiment",
    }

    # Sorted by last commit date, newest first.
    assert [b.name for b in result.branches][:2] == ["feature-open", "main"]

    assert by_name["main"].status == BranchStatus.default
    assert by_name["main"].is_default

    merged = by_name["feature-merged"]
    assert merged.merged is True
    assert merged.status == BranchStatus.merged

    squashed = by_name["feature-squashed"]
    assert squashed.merged is False
    assert squashed.squash_merged is True
    assert squashed.status == BranchStatus.merged
    assert squashed.ahead == 2  # its two original commits are not ancestors of main

    open_branch = by_name["feature-open"]
    assert open_branch.status == BranchStatus.active
    assert open_branch.author_name == "Bob"
    assert open_branch.ahead == 1

    stale = by_name["old-experiment"]
    assert stale.status == BranchStatus.stale
    assert stale.merged is False


def test_inspect_branches_empty_repo(tmp_path: Path) -> None:
    repo = tmp_path / "empty"
    repo.mkdir()
    _git(repo, "init", "-q", "-b", "main")

    result = inspect_branches(repo, "main", provider_is_local=True)

    assert result.total_branches == 0
    assert result.branches == []
    assert result.merged_count == 0
