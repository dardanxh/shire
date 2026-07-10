"""Local git clone service (GitPython-backed)."""

from __future__ import annotations

from pathlib import Path

from git import Git, GitCommandError, Repo

from hobits.domain.repository.domain import CloneOutcome, GitProvider, RepoCoordinates


class GitCloneService:
    """Clones a repository into `clone_root/<provider>/<owner>/<name>` (or updates it)."""

    def __init__(self, clone_root: Path) -> None:
        self._clone_root = clone_root

    def _dest(self, coordinates: RepoCoordinates) -> Path:
        return self._clone_root / coordinates.provider.value / coordinates.owner / coordinates.name

    def _use_local(self, path: str) -> CloneOutcome:
        """Point at an existing on-disk repo instead of cloning: validate it's a git working tree,
        then read its branch + HEAD in place. The `clone_path` is the given path (no copy)."""
        dest = Path(path).expanduser()
        if not dest.is_dir():
            raise FileNotFoundError(f"No such directory: {dest}")
        if not (dest / ".git").exists():
            raise ValueError(f"Not a git repository (no .git): {dest}")
        repo = Repo(dest)
        try:
            default_branch = repo.active_branch.name
        except (TypeError, GitCommandError):
            default_branch = "main"
        return CloneOutcome(
            clone_path=str(dest),
            default_branch=default_branch,
            head_sha=repo.head.commit.hexsha,
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

    def clone(self, url: str, coordinates: RepoCoordinates) -> CloneOutcome:
        if coordinates.provider is GitProvider.local:
            return self._use_local(url)

        dest = self._dest(coordinates)
        dest.parent.mkdir(parents=True, exist_ok=True)

        if (dest / ".git").exists():
            repo = Repo(dest)
            try:
                repo.remotes.origin.fetch(prune=True)
                repo.remotes.origin.pull()
            except GitCommandError:
                pass  # offline / detached — analyze whatever is on disk
        else:
            repo = Repo.clone_from(url, dest)

        try:
            default_branch = repo.active_branch.name
        except (TypeError, GitCommandError):
            default_branch = "main"

        return CloneOutcome(
            clone_path=str(dest),
            default_branch=default_branch,
            head_sha=repo.head.commit.hexsha,
        )
