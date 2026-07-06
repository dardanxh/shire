"""Integration test: build a real temp git repo and run the full scanner pipeline offline."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from hobits.repository.domain.value_objects import GitProvider, RepoUrl
from hobits.substrate.infrastructure.git_history import build_scan_context
from hobits.substrate.infrastructure.scanners import default_scanners


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


def test_repo_url_parsing() -> None:
    _url, coords = RepoUrl.parse("https://github.com/pallets/flask.git")
    assert coords.provider is GitProvider.github
    assert coords.slug == "pallets/flask"

    _url, ssh_coords = RepoUrl.parse("git@gitlab.com:group/proj.git")
    assert ssh_coords.provider is GitProvider.gitlab
    assert ssh_coords.slug == "group/proj"
