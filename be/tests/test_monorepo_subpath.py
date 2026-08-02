"""Monorepo support: subpath coordinates, upward .git discovery, scoped scan context."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from shire.core.exceptions import ValidationError
from shire.domain.repository.domain import GitProvider, RepoCoordinates, Repository, RepoUrl
from shire.domain.repository.services import _normalize_subpath
from shire.integrations.git_clone import discover_git_root
from shire.integrations.git_history import build_scan_context


def _git(cwd: Path, *args: str) -> None:
    env = {
        "GIT_AUTHOR_NAME": "Alice",
        "GIT_AUTHOR_EMAIL": "alice@example.com",
        "GIT_COMMITTER_NAME": "Alice",
        "GIT_COMMITTER_EMAIL": "alice@example.com",
    }
    subprocess.run(["git", *args], cwd=cwd, check=True, env={"PATH": "/usr/bin:/bin", **env})


@pytest.fixture
def monorepo(tmp_path: Path) -> Path:
    """A repo with ui/ and be/ subprojects and one commit per area."""
    repo = tmp_path / "mono"
    (repo / "ui").mkdir(parents=True)
    (repo / "be").mkdir()
    _git(repo, "init", "-q", "-b", "main")
    (repo / "ui" / "app.tsx").write_text("export const App = () => null\n")
    _git(repo, "add", "."), _git(repo, "commit", "-q", "-m", "ui: app shell")
    (repo / "be" / "main.py").write_text("def main():\n    return 1\n")
    _git(repo, "add", "."), _git(repo, "commit", "-q", "-m", "be: entrypoint")
    return repo


# --- coordinates / aggregate ---------------------------------------------------


def test_slug_includes_subpath() -> None:
    coords = RepoCoordinates(provider=GitProvider.github, owner="acme", name="mono")
    assert coords.slug == "acme/mono"
    focused = coords.model_copy(update={"subpath": "packages/ui"})
    assert focused.slug == "acme/mono/packages/ui"


def test_analysis_path_scopes_to_subpath() -> None:
    coords = RepoCoordinates(
        provider=GitProvider.github, owner="acme", name="mono", subpath="ui"
    )
    repo = Repository(coordinates=coords, url=RepoUrl(value="https://github.com/acme/mono"))
    assert repo.analysis_path is None  # not cloned yet
    repo.mark_cloned("/data/repos/github/acme/mono", "main")
    assert repo.analysis_path == "/data/repos/github/acme/mono/ui"
    assert repo.clone_path == "/data/repos/github/acme/mono"


def test_normalize_subpath() -> None:
    assert _normalize_subpath(None) == ""
    assert _normalize_subpath("  ") == ""
    assert _normalize_subpath("/packages/ui/") == "packages/ui"
    assert _normalize_subpath("packages\\ui") == "packages/ui"
    assert _normalize_subpath("./ui") == "ui"
    with pytest.raises(ValidationError):
        _normalize_subpath("../outside")


# --- upward .git discovery -----------------------------------------------------


def test_discover_git_root_from_subdirectory(monorepo: Path) -> None:
    assert discover_git_root(monorepo) == (monorepo.resolve(), "")
    assert discover_git_root(monorepo / "ui") == (monorepo.resolve(), "ui")


def test_discover_git_root_outside_any_repo(tmp_path: Path) -> None:
    plain = tmp_path / "plain"
    plain.mkdir()
    assert discover_git_root(plain) is None


# --- scoped scan context -------------------------------------------------------


def test_scan_context_scopes_history_and_paths(monorepo: Path) -> None:
    head = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=monorepo, check=True, capture_output=True, text=True
    ).stdout.strip()

    full = build_scan_context(monorepo, head)
    assert full.clone_path == monorepo
    assert len(full.commits) == 2

    scoped = build_scan_context(monorepo, head, subpath="ui")
    assert scoped.clone_path == monorepo / "ui"
    assert len(scoped.commits) == 1  # only the ui commit
    files = scoped.commits[0].files_changed
    assert [f.path for f in files] == ["app.tsx"]  # rewritten relative to the subdirectory
