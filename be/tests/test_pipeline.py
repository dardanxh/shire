"""Integration test: build a real temp git repo and run the full scanner pipeline offline."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from shire.domain.repository.domain import GitProvider, RepoUrl
from shire.integrations.git_clone import GitCloneService
from shire.integrations.git_history import build_scan_context
from shire.integrations.scanners import default_scanners


def _git(cwd: Path, *args: str) -> None:
    env = {
        "GIT_AUTHOR_NAME": "Alice",
        "GIT_AUTHOR_EMAIL": "alice@example.com",
        "GIT_COMMITTER_NAME": "Alice",
        "GIT_COMMITTER_EMAIL": "alice@example.com",
    }
    subprocess.run(["git", *args], cwd=cwd, check=True, env={"PATH": "/usr/bin:/bin", **env})


@pytest.fixture
def sample_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "sample"
    repo.mkdir()
    _git(repo, "init", "-q", "-b", "main")

    (repo / "app.py").write_text("import os\n\n\ndef main():\n    return os.getcwd()\n")
    (repo / "requirements.txt").write_text("fastapi>=0.115\nhttpx==0.27.0\n")
    (repo / "LICENSE").write_text(
        "MIT License\n\nPermission is hereby granted, free of charge, to any person\n"
    )
    (repo / "tests").mkdir()
    (repo / "tests" / "test_app.py").write_text("def test_main():\n    assert True\n")
    (repo / ".github" / "workflows").mkdir(parents=True)
    (repo / ".github" / "workflows" / "ci.yml").write_text("name: ci\non: [push]\n")

    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "initial")
    # a second commit touching app.py to create churn
    (repo / "app.py").write_text("import os\nimport sys\n\n\ndef main():\n    return sys.argv\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "update app")
    return repo


def test_full_pipeline(sample_repo: Path) -> None:
    head = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=sample_repo,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()

    ctx = build_scan_context(sample_repo, head)
    assert len(ctx.commits) == 2

    merged: dict = {}
    for scanner in default_scanners():
        contribution = scanner.scan(ctx)
        for key, value in contribution.model_dump().items():
            if value not in (None, [], (), 0, False):
                merged[key] = value

    assert merged["commit_count"] == 2
    assert merged["primary_language"] == "Python"
    assert merged["loc_total"] > 0
    assert merged["has_tests"] is True
    assert any(d["name"] == "fastapi" for d in merged["dependencies"])
    assert any(c["system"] == "github_actions" for c in merged["cicd"])
    assert merged["license"]["spdx_id"] == "MIT"
    assert any(h["path"] == "app.py" for h in merged["hotspots"])
    assert len(merged["contributors"]) == 1

    # Line-level churn (git log --numstat): the sole author added lines across several files.
    alice = merged["contributors"][0]
    assert alice["commits"] == 2
    assert alice["lines_added"] > 0
    assert alice["files_touched"] >= 1

    # Testing metrics (deterministic scanner): one test fn with one assertion.
    assert merged["test_count"] == 1
    assert merged["test_file_count"] == 1
    assert merged["assertion_density"] == 1.0
    # Ownership/maintenance (git history): single author, freshly committed.
    assert merged["bus_factor"] == 1
    assert merged["top_author_share"] == 1.0
    assert merged["maintenance_status"] == "active"


def test_remote_head_reads_current_commit(sample_repo: Path, tmp_path: Path) -> None:
    """The change gate's cheap side: `ls-remote` against a local repo returns its HEAD, which the
    scheduler compares to a hobit's last-analyzed commit to decide whether to spend a run."""
    head = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=sample_repo,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()

    svc = GitCloneService(tmp_path / "clones")
    assert svc.remote_head(str(sample_repo), "main") == head
    # A branch that doesn't exist falls back to HEAD rather than erroring.
    assert svc.remote_head(str(sample_repo), "no-such-branch") == head


def test_remote_head_returns_none_when_unreachable(tmp_path: Path) -> None:
    """Offline / bad URL → None, so the scheduler runs rather than wrongly skipping as unchanged."""
    svc = GitCloneService(tmp_path / "clones")
    assert svc.remote_head(str(tmp_path / "does-not-exist"), "main") is None


def test_repo_url_parsing() -> None:
    _url, coords = RepoUrl.parse("https://github.com/pallets/flask.git")
    assert coords.provider is GitProvider.github
    assert coords.slug == "pallets/flask"

    _url, ssh_coords = RepoUrl.parse("git@gitlab.com:group/proj.git")
    assert ssh_coords.provider is GitProvider.gitlab
    assert ssh_coords.slug == "group/proj"

    # An absolute local path is its own provider; owner/name come from the path tail.
    local_url, local_coords = RepoUrl.parse("/Users/me/code/myrepo")
    assert local_coords.provider is GitProvider.local
    assert local_coords.slug == "code/myrepo"
    assert local_url.value == "/Users/me/code/myrepo"

    # A relative path is not a valid source (must be absolute).
    with pytest.raises(ValueError):
        RepoUrl.parse("some/relative/path")


def test_author_identity_merges_split_git_identities() -> None:
    """One person under two emails (or two name spellings) resolves to a single identity, so
    Top Contributors / bus factor count people, not git identities."""
    from types import SimpleNamespace

    from shire.integrations.scanners.git import _author_key_resolver

    commits = [
        SimpleNamespace(author_name="Khalil Sharkawi", author_email="khalil@work.com"),
        SimpleNamespace(author_name="Khalil Sharkawi", author_email="khalil@personal.com"),
        SimpleNamespace(author_name="K. Sharkawi", author_email="khalil@work.com"),
        SimpleNamespace(author_name="Someone Else", author_email="else@example.com"),
    ]
    key = _author_key_resolver(commits)
    keys = [key(c) for c in commits]
    # Shared name links the two emails; the shared work email links the name variant → all one.
    assert keys[0] == keys[1] == keys[2]
    assert keys[3] != keys[0]
    assert len(set(keys)) == 2


def test_clone_checkout_branch(sample_repo: Path, tmp_path: Path) -> None:
    """Cloning with `branch` checks that branch out (remote-tracking preferred) and reports it
    as the outcome's active_branch — the lever the branch switcher relies on."""
    from shire.domain.repository.domain import RepoCoordinates

    _git(sample_repo, "checkout", "-q", "-b", "feature-x")
    (sample_repo / "feature.txt").write_text("hello\n")
    _git(sample_repo, "add", "-A")
    _git(sample_repo, "commit", "-q", "-m", "feature work")
    _git(sample_repo, "checkout", "-q", "main")

    svc = GitCloneService(tmp_path / "clones")
    coords = RepoCoordinates(provider=GitProvider.github, owner="acme", name="sample")

    first = svc.clone(str(sample_repo), coords)
    assert first.active_branch == "main"

    switched = svc.clone(str(sample_repo), coords, branch="feature-x")
    assert switched.active_branch == "feature-x"
    assert (Path(switched.clone_path) / "feature.txt").exists()


def test_local_clone_never_checks_out_without_branch(sample_repo: Path, tmp_path: Path) -> None:
    """Refresh/ingest on a local-provider repo must adopt the user's checkout, never move it."""
    from shire.domain.repository.domain import RepoCoordinates

    _git(sample_repo, "checkout", "-q", "-b", "wip")
    svc = GitCloneService(tmp_path / "clones")
    coords = RepoCoordinates(provider=GitProvider.local, owner="local", name="sample")

    outcome = svc.clone(str(sample_repo), coords)
    assert outcome.active_branch == "wip"  # adopted, not changed
    assert outcome.clone_path == str(sample_repo)


def test_local_switch_dirty_tree_raises(sample_repo: Path, tmp_path: Path) -> None:
    """Switching a local repo's branch with uncommitted changes must refuse, not clobber."""
    from shire.domain.repository.domain import RepoCoordinates
    from shire.integrations.git_clone import DirtyWorkingTreeError

    _git(sample_repo, "branch", "-q", "b2")
    (sample_repo / "app.py").write_text("# uncommitted edit\n")

    svc = GitCloneService(tmp_path / "clones")
    coords = RepoCoordinates(provider=GitProvider.local, owner="local", name="sample")
    with pytest.raises(DirtyWorkingTreeError):
        svc.clone(str(sample_repo), coords, branch="b2")
    # the user's edit is untouched
    assert (sample_repo / "app.py").read_text() == "# uncommitted edit\n"
