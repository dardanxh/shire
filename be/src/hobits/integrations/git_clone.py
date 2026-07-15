"""Local git clone service (GitPython-backed)."""

from __future__ import annotations

import contextlib
from pathlib import Path

from git import Git, GitCommandError, Repo

from hobits.domain.repository.domain import CloneOutcome, GitProvider, RepoCoordinates


class DirtyWorkingTreeError(Exception):
    """The working tree has uncommitted changes — a checkout would clobber them."""


class BranchNotFoundInCloneError(Exception):
    """The requested branch resolves to neither a remote-tracking nor a local ref."""


class GitCloneService:
    """Clones a repository into `clone_root/<provider>/<owner>/<name>` (or updates it)."""

    def __init__(self, clone_root: Path) -> None:
        self._clone_root = clone_root

    def _dest(self, coordinates: RepoCoordinates) -> Path:
        return self._clone_root / coordinates.provider.value / coordinates.owner / coordinates.name

    def _use_local(self, path: str, branch: str | None = None) -> CloneOutcome:
        """Point at an existing on-disk repo instead of cloning: validate it's a git working tree,
        then read its branch + HEAD in place. The `clone_path` is the given path (no copy).

        With `branch`, checks out that LOCAL branch in the user's own working tree — an explicit
        user action, guarded by a dirty-tree check so uncommitted work is never clobbered. With
        `branch=None` (ingest/refresh) the tree is never touched: we adopt whatever is checked out.
        """
        dest = Path(path).expanduser()
        if not dest.is_dir():
            raise FileNotFoundError(f"No such directory: {dest}")
        if not (dest / ".git").exists():
            raise ValueError(f"Not a git repository (no .git): {dest}")
        repo = Repo(dest)

        active = _active_branch(repo)
        if branch is not None and branch != active:
            ensure_clean(dest)
            try:
                repo.git.checkout(branch)  # local heads only — never origin refs for local repos
            except GitCommandError as exc:
                # git's own safety check (e.g. an untracked file would be overwritten).
                raise DirtyWorkingTreeError(
                    f"Could not check out '{branch}' in {dest}: {exc.stderr or exc}"
                ) from exc
            active = _active_branch(repo)

        return CloneOutcome(
            clone_path=str(dest),
            default_branch=active or "main",
            head_sha=repo.head.commit.hexsha,
            active_branch=active,
        )

    def remote_head(self, url: str, branch: str | None = None) -> str | None:
        """The current HEAD commit of `branch` on the remote, without cloning (a network-only
        `git ls-remote`). This is the cheap left-hand side of the change gate. Returns None when
        offline or the ref can't be resolved, so callers fall back to running rather than skipping.
        """
        try:
            out = Git().ls_remote(url, branch or "HEAD")
            if not out.strip() and branch:
                out = Git().ls_remote(url, "HEAD")  # branch not found remotely — fall back to HEAD
            first = out.strip().split("\n", 1)[0]
            sha = first.split("\t", 1)[0].strip()
            return sha or None
        except GitCommandError:
            return None

    def clone(
        self, url: str, coordinates: RepoCoordinates, branch: str | None = None
    ) -> CloneOutcome:
        if coordinates.provider is GitProvider.local:
            return self._use_local(url, branch)

        dest = self._dest(coordinates)
        dest.parent.mkdir(parents=True, exist_ok=True)

        if (dest / ".git").exists():
            repo = Repo(dest)
            with contextlib.suppress(GitCommandError):  # offline — work with what's on disk
                repo.remotes.origin.fetch(prune=True)
            if branch is not None:
                _checkout(repo, branch)
            active = _active_branch(repo)
            if active is not None:
                # Pull the *active* branch explicitly, not whatever upstream pull() guesses.
                with contextlib.suppress(GitCommandError):  # offline / no upstream
                    repo.remotes.origin.pull(active)
            default_branch = active or "main"
        else:
            repo = Repo.clone_from(url, dest)
            # The fresh clone's HEAD is the remote's default branch — read it before any checkout.
            default_branch = _active_branch(repo) or "main"
            if branch is not None:
                _checkout(repo, branch)

        return CloneOutcome(
            clone_path=str(dest),
            default_branch=default_branch,
            head_sha=repo.head.commit.hexsha,
            active_branch=_active_branch(repo),
        )


def ensure_clean(clone_path: Path | str) -> None:
    """Raise DirtyWorkingTreeError when the working tree has staged or unstaged changes.
    Untracked files are tolerated — git's own checkout safety covers clobber cases."""
    repo = Repo(clone_path)
    if repo.is_dirty(index=True, working_tree=True, untracked_files=False):
        raise DirtyWorkingTreeError(
            f"Working tree at {clone_path} has uncommitted changes — commit or stash them first."
        )


def _active_branch(repo: Repo) -> str | None:
    try:
        return repo.active_branch.name
    except (TypeError, GitCommandError):
        return None  # detached HEAD


def _checkout(repo: Repo, branch: str) -> None:
    """Check out `branch` in one of our own clones: prefer the remote-tracking ref (creates or
    resets the local branch to mirror the remote), fall back to an existing local head."""
    if _ref_exists(repo, f"refs/remotes/origin/{branch}"):
        repo.git.checkout("-B", branch, f"origin/{branch}")
    elif _ref_exists(repo, f"refs/heads/{branch}"):
        repo.git.checkout(branch)
    else:
        raise BranchNotFoundInCloneError(f"Branch '{branch}' not found in the clone")


def _ref_exists(repo: Repo, ref: str) -> bool:
    try:
        repo.git.rev_parse("--verify", "--quiet", f"{ref}^{{commit}}")
        return True
    except GitCommandError:
        return False
