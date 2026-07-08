"""Extract commit history (with changed files) from a clone in a single git pass."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from git import GitCommandError, Repo

from hobits.domain.substrate.domain import CommitInfo, FileChange, ScanContext

_REC = "\x1e"  # record separator between commits
_UNIT = "\x1f"  # unit separator between header fields
_PRETTY = f"{_REC}%H{_UNIT}%an{_UNIT}%ae{_UNIT}%aI"


def _parse_numstat_line(line: str) -> FileChange | None:
    """A `--numstat` body line is `<added>\\t<deleted>\\t<path>` (binary files use `-` counts)."""
    parts = line.split("\t")
    if len(parts) != 3:
        return None
    added_raw, deleted_raw, path = parts
    path = path.strip()
    if not path:
        return None
    added = int(added_raw) if added_raw.isdigit() else 0
    deleted = int(deleted_raw) if deleted_raw.isdigit() else 0
    return FileChange(path=path, additions=added, deletions=deleted)


def build_scan_context(clone_path: Path, head_sha: str, repo_url: str | None = None) -> ScanContext:
    repo = Repo(clone_path)
    commits: list[CommitInfo] = []
    try:
        # `--numstat` yields per-file added/deleted line counts, a superset of `--name-only`.
        raw = repo.git.log("HEAD", f"--pretty=format:{_PRETTY}", "--numstat")
    except GitCommandError:
        raw = ""

    for block in raw.split(_REC):
        block = block.strip("\n")
        if not block:
            continue
        header, _, body = block.partition("\n")
        parts = header.split(_UNIT)
        if len(parts) != 4:
            continue
        sha, name, email, iso = parts
        files = tuple(
            fc for line in body.splitlines() if (fc := _parse_numstat_line(line)) is not None
        )
        commits.append(
            CommitInfo(
                sha=sha,
                author_name=name,
                author_email=email,
                committed_at=datetime.fromisoformat(iso),
                files_changed=files,
            )
        )

    return ScanContext(
        clone_path=clone_path, head_sha=head_sha, commits=tuple(commits), repo_url=repo_url
    )
