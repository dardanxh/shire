"""Local git clone service (GitPython-backed)."""

from __future__ import annotations

import contextlib
import logging
from pathlib import Path

from git import Git, GitCommandError, Repo

from shire.domain.repository.domain import CloneOutcome, GitProvider, RepoCoordinates

logger = logging.getLogger(__name__)


class DirtyWorkingTreeError(Exception):
    """The working tree has uncommitted changes — a checkout would clobber them."""


class BranchNotFoundInCloneError(Exception):
    """The requested branch resolves to neither a remote-tracking nor a local ref."""


def discover_git_root(path: Path) -> tuple[Path, str] | None:
    """Walk up from `path` to the nearest ancestor containing a `.git`. Returns (root,
    relative subpath) — subpath '' when `path` itself is the root — or None when nothing
    upward is a git repository. Lets a user paste a monorepo *subdirectory* and have the
    repo root + focus subpath figured out automatically."""
    p = path.expanduser()
    try:
        p = p.resolve()
    except OSError:
        return None
    for candidate in (p, *p.parents):
        if (candidate / ".git").exists():
            return candidate, "" if candidate == p else p.relative_to(candidate).as_posix()
    return None


class GitCloneService:
    """Clones a repository into `clone_root/<provider>/<owner>/<name>` (or updates it)."""

    def __init__(self, clone_root: Path) -> None:
        self._clone_root = clone_root

    def _dest(self, coordinates: RepoCoordinates) -> Path:
        return self._clone_root / coordinates.provider.value / coordinates.owner / coordinates.name

    def _use_local(
        self, path: str, branch: str | None = None, *, pull: bool = False
    ) -> CloneOutcome:
        """Point at an existing on-disk repo instead of cloning: validate it's a git working tree,
        then read its branch + HEAD in place. The `clone_path` is the given path (no copy).

        With `branch`, checks out that LOCAL branch in the user's own working tree — an explicit
        user action, guarded by a dirty-tree check so uncommitted work is never clobbered.

        With `pull` (a user pressing "Pull latest") the active branch is fast-forwarded onto its
        upstream first, so commits pushed by others land before analysis — see
        `_fast_forward_local` for the guarantees. Without it (first ingest, scheduled runs) the
        tree is never touched: we adopt whatever is checked out.
        """
        dest = Path(path).expanduser()
        if not dest.is_dir():
            hint = ""
            if Path("/.dockerenv").exists():
                hint = (
                    " — Shire runs in Docker and cannot see your files until you share a "
                    "folder with it: re-run ./setup.sh and enter the folder where you keep "
                    "your repositories when asked. If you already did, check that the repo is "
                    "under that folder and the capitalization matches exactly — paths inside "
                    "the container are case-sensitive, unlike the macOS default."
                )
            raise FileNotFoundError(f"No such directory: {dest}{hint}")
        if not (dest / ".git").exists():
            raise ValueError(f"Not a git repository (no .git): {dest}")
        repo = Repo(dest)

        if pull and branch is None:
            _fast_forward_local(repo, dest)

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
        self,
        url: str,
        coordinates: RepoCoordinates,
        branch: str | None = None,
        *,
        pull: bool = False,
    ) -> CloneOutcome:
        """Our own clones always fetch + pull (they're ours to move). `pull` only matters for
        local-provider repos, where the checkout belongs to the user — see `_use_local`."""
        if coordinates.provider is GitProvider.local:
            return self._use_local(url, branch, pull=pull)

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


def _fast_forward_local(repo: Repo, dest: Path) -> None:
    """`git pull --ff-only` on the user's own checkout, best-effort.

    Fetch the active branch's upstream, then move the branch onto it only when the move is a
    pure fast-forward and the tree has no uncommitted changes. Everything else — detached HEAD,
    no upstream, unreachable remote (no credentials in the container, offline), dirty tree,
    diverged history — is a logged no-op, and the caller analyzes whatever is on disk exactly
    as before. Nothing here can rewrite or lose the user's work: no merge commit, no rebase,
    no stash, no checkout of a different branch.
    """
    try:
        active = _active_branch(repo)
        if active is None:
            return  # detached HEAD — nothing to fast-forward
        tracking = repo.active_branch.tracking_branch()
        if tracking is None:
            logger.info(
                "Pull latest: no upstream for '%s' in %s — using what's on disk", active, dest
            )
            return
        try:
            repo.remote(tracking.remote_name).fetch(prune=True)
        except (GitCommandError, ValueError) as exc:
            # Offline, or no credentials for this remote (an SSH remote inside a container
            # without a key is the common one). Not fatal: analyze the current checkout.
            logger.warning(
                "Pull latest: could not fetch %s for %s: %s", tracking.remote_name, dest, exc
            )
            return
        if tracking.commit == repo.head.commit:
            return  # already up to date
        if repo.is_dirty(index=True, working_tree=True, untracked_files=False):
            logger.info("Pull latest: %s has uncommitted changes — not fast-forwarding", dest)
            return
        bases = repo.merge_base(repo.head.commit, tracking.commit)
        if not bases or bases[0] != repo.head.commit:
            logger.info(
                "Pull latest: '%s' in %s has diverged from %s — not fast-forwarding",
                active,
                dest,
                tracking.name,
            )
            return
        repo.git.merge("--ff-only", tracking.name)
        logger.info("Pull latest: fast-forwarded '%s' in %s to %s", active, dest, tracking.name)
    except Exception:
        # A pull that can't happen must never fail the ingest pipeline.
        logger.exception("Pull latest: fast-forward of %s failed", dest)


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
