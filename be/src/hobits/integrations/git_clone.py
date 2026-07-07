"""Local git clone service (GitPython-backed)."""

from __future__ import annotations

from pathlib import Path

from git import GitCommandError, Repo

from hobits.domain.repository.domain import CloneOutcome, RepoCoordinates


class GitCloneService:
    """Clones a repository into `clone_root/<provider>/<owner>/<name>` (or updates it)."""

    def __init__(self, clone_root: Path) -> None:
        self._clone_root = clone_root

    def _dest(self, coordinates: RepoCoordinates) -> Path:
        return self._clone_root / coordinates.provider.value / coordinates.owner / coordinates.name

    def clone(self, url: str, coordinates: RepoCoordinates) -> CloneOutcome:
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
