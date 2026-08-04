"""Extract commit history (with changed files) from a clone in a single git pass."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from git import GitCommandError, Repo

from shire.domain.substrate.domain import CommitInfo, FileChange, ScanContext

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


def build_scan_context(
    clone_path: Path,
    head_sha: str,
    repo_url: str | None = None,
    subpath: str = "",
) -> ScanContext:
    """The scanners' world view. `clone_path` is the git root; with `subpath` (monorepo
    focus) the context's `clone_path` becomes the subdirectory, history is limited to
    commits touching it, and file paths are rewritten relative to it — so every scanner
    scopes automatically without knowing monorepos exist."""
    repo = Repo(clone_path)
    commits: list[CommitInfo] = []
    try:
        # `--numstat` yields per-file added/deleted line counts, a superset of `--name-only`.
        args = ["HEAD", f"--pretty=format:{_PRETTY}", "--numstat"]
        if subpath:
            args += ["--", subpath]
        raw = repo.git.log(*args)
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
        if subpath:
            # Paths come repo-root-relative; scanners resolve them against the (scoped)
            # context clone_path, so rewrite them relative to the subdirectory.
            prefix = subpath.rstrip("/") + "/"
            files = tuple(
                fc.model_copy(update={"path": fc.path[len(prefix) :]})
                for fc in files
                if fc.path.startswith(prefix)
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
        clone_path=clone_path / subpath if subpath else clone_path,
        head_sha=head_sha,
        commits=tuple(commits),
        repo_url=repo_url,
    )


_SUBJECT_LIMIT = 200


def commit_subjects_since(
    clone_path: Path,
    since: datetime,
    subpath: str = "",
    until: datetime | None = None,
) -> str:
    """One line per commit (`sha author: subject`) since a timestamp, newest first — embedded
    in Pulse summary prompts because engine agents cannot run git themselves. Bounded above
    by `until` (exclusive) when given. Scoped to `subpath` for monorepo-focused records.
    Best-effort: '' when git can't answer."""
    try:
        repo = Repo(clone_path)
        args = [
            f"--since={since.isoformat()}",
            f"--max-count={_SUBJECT_LIMIT}",
            "--format=%h %an: %s",
        ]
        if until is not None:
            args.append(f"--until={until.isoformat()}")
        if subpath:
            args += ["--", subpath]
        return repo.git.log(*args).strip()
    except (GitCommandError, OSError, ValueError):
        return ""
