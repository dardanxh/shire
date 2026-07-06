"""Extract commit history (with changed files) from a clone in a single git pass."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from git import GitCommandError, Repo

from hobits.substrate.domain.ports import CommitInfo, ScanContext

_REC = "\x1e"  # record separator between commits
_UNIT = "\x1f"  # unit separator between header fields
_PRETTY = f"{_REC}%H{_UNIT}%an{_UNIT}%ae{_UNIT}%aI"


def build_scan_context(clone_path: Path, head_sha: str) -> ScanContext:
    repo = Repo(clone_path)
    commits: list[CommitInfo] = []
    try:
        raw = repo.git.log("HEAD", f"--pretty=format:{_PRETTY}", "--name-only")
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
        files = tuple(line.strip() for line in body.splitlines() if line.strip())
        commits.append(
            CommitInfo(
                sha=sha,
                author_name=name,
                author_email=email,
                committed_at=datetime.fromisoformat(iso),
                files_changed=files,
            )
        )

    return ScanContext(clone_path=clone_path, head_sha=head_sha, commits=tuple(commits))
