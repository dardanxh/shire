"""Git worktree service for roadmap executions (GitPython-backed).

An execution gets a disposable worktree off the repository's main clone: it shares the object
store (fast, disk-cheap) while giving the write-enabled agent a checkout that can never disturb
the analysis pipeline running against the main clone. The push uses a transient credentialed
URL passed straight to `git push` — it is never written to any remote config, and any
GitCommandError text is scrubbed before it can be persisted (GitPython embeds the command line,
credential included, in its exceptions).
"""

from __future__ import annotations

import contextlib
import shutil
from pathlib import Path

from git import GitCommandError, Repo

_COMMIT_IDENTITY = {
    "GIT_AUTHOR_NAME": "hobits",
    "GIT_AUTHOR_EMAIL": "hobits@localhost",
    "GIT_COMMITTER_NAME": "hobits",
    "GIT_COMMITTER_EMAIL": "hobits@localhost",
}


def scrub_secrets(text: str, secrets: list[str | None]) -> str:
    """Blank every secret (and its URL-encoded form) out of arbitrary error text."""
    from urllib.parse import quote

    for secret in secrets:
        if not secret:
            continue
        text = text.replace(secret, "***")
        encoded = quote(secret, safe="")
        if encoded != secret:
            text = text.replace(encoded, "***")
    return text


def add_worktree(clone_path: Path, worktree_path: Path, branch: str, base_branch: str) -> str:
    """Create `worktree_path` on new local branch `branch` off origin/<base_branch> (falling back
    to the local base branch when the remote ref is missing). Returns the base commit sha."""
    repo = Repo(clone_path)
    with contextlib.suppress(GitCommandError):
        repo.git.fetch("origin", base_branch)
    base_ref = base_branch
    with contextlib.suppress(GitCommandError):
        repo.git.rev_parse("--verify", f"origin/{base_branch}")
        base_ref = f"origin/{base_branch}"
    worktree_path.parent.mkdir(parents=True, exist_ok=True)
    repo.git.worktree("add", "-b", branch, str(worktree_path), base_ref)
    return Repo(worktree_path).head.commit.hexsha


def commit_all(worktree_path: Path, message: str) -> str | None:
    """Stage everything and commit with the platform identity. None when the tree is clean."""
    worktree = Repo(worktree_path)
    worktree.git.add("-A")
    if not worktree.git.status("--porcelain"):
        return None
    with worktree.git.custom_environment(**_COMMIT_IDENTITY):
        worktree.git.commit("-m", message)
    return worktree.head.commit.hexsha


def push_branch(worktree_path: Path, authenticated_url: str, branch: str) -> None:
    """Push the branch via a transient credentialed URL (never stored in git config)."""
    Repo(worktree_path).git.push(authenticated_url, f"{branch}:{branch}")


def remove_worktree(clone_path: Path, worktree_path: Path, branch: str | None = None) -> None:
    """Remove a worktree and prune its metadata; best-effort in every step so cleanup never
    masks the error that led here. With `branch`, also deletes the local branch ref (after a
    successful push the branch lives on the remote; the local ref is clutter)."""
    repo = None
    with contextlib.suppress(Exception):
        repo = Repo(clone_path)
    if repo is not None:
        with contextlib.suppress(GitCommandError):
            repo.git.worktree("remove", "--force", str(worktree_path))
        with contextlib.suppress(GitCommandError):
            repo.git.worktree("prune")
    if worktree_path.exists():
        shutil.rmtree(worktree_path, ignore_errors=True)
    if repo is not None and branch:
        with contextlib.suppress(GitCommandError):
            repo.git.branch("-D", branch)
