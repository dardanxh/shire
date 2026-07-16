"""Branch-pair diff footprint against a local clone (GitPython-backed).

Computes everything the merge-review module charts: per-file additions/deletions (rename- and
binary-aware), current file sizes in LOC, directory aggregation, commit/author counts, and a
bounded diff excerpt for AI prompts. All git work is local; the only network I/O is a best-effort
`fetch --prune` so remote-tracking refs mirror the remote (same policy as `git_branches`).
"""

from __future__ import annotations

import fnmatch
import subprocess
from dataclasses import dataclass
from pathlib import Path

from git import GitCommandError, Repo

from shire.domain.merge_review.domain import (
    DirectoryFootprint,
    FileFootprint,
    Footprint,
    classify_size,
    is_efficient,
    is_test_path,
)
from shire.integrations.scanners.git import _author_key_resolver

_FETCH_TIMEOUT_SECONDS = 10

# Generated/lock files carry no review signal — excluded from the diff excerpt (not the footprint).
_EXCERPT_DENY_NAMES = frozenset(
    {"uv.lock", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "poetry.lock", "Cargo.lock"}
)
_EXCERPT_DENY_GLOBS = ("*.min.*", "*.map", "*.snap")

DEFAULT_MAX_TOTAL_BYTES = 150_000
DEFAULT_MAX_FILE_BYTES = 20_000
DEFAULT_MAX_FILES = 40


class BranchNotFoundError(Exception):
    """The requested branch resolves to no commit in the clone."""

    def __init__(self, branch: str) -> None:
        super().__init__(f"Branch '{branch}' not found")
        self.branch = branch


class UnrelatedHistoriesError(Exception):
    """The two branches share no common ancestor — there is nothing to diff as an MR."""


@dataclass(frozen=True)
class _Author:
    author_name: str
    author_email: str


def resolve_branch_ref(repo: Repo, branch: str, *, provider_is_local: bool) -> str:
    """Resolve a branch name to a concrete ref, preferring the remote-tracking ref (it mirrors
    the remote post-fetch); local-source repos only have local heads."""
    candidates = [] if provider_is_local else [f"refs/remotes/origin/{branch}"]
    candidates.append(f"refs/heads/{branch}")
    for ref in candidates:
        try:
            repo.git.rev_parse("--verify", "--quiet", f"{ref}^{{commit}}")
            return ref
        except GitCommandError:
            continue
    raise BranchNotFoundError(branch)


def rev_of_branch(clone_path: Path | str, branch: str, *, provider_is_local: bool) -> str | None:
    """Cheap local staleness probe: the branch's current sha, or None when it no longer resolves."""
    repo = Repo(clone_path)
    try:
        ref = resolve_branch_ref(repo, branch, provider_is_local=provider_is_local)
        return repo.git.rev_parse(ref)
    except (BranchNotFoundError, GitCommandError):
        return None


def compute_footprint(
    clone_path: Path | str, source: str, target: str, *, provider_is_local: bool
) -> Footprint:
    """The full change footprint of `target...source` (merge-base to source head).

    Hotspot fields come back empty — the caller overlays them from the substrate analysis.
    """
    repo = Repo(clone_path)
    _fetch(repo, provider_is_local)

    source_ref = resolve_branch_ref(repo, source, provider_is_local=provider_is_local)
    target_ref = resolve_branch_ref(repo, target, provider_is_local=provider_is_local)
    source_sha = repo.git.rev_parse(source_ref)
    target_sha = repo.git.rev_parse(target_ref)
    try:
        merge_base = repo.git.merge_base(target_sha, source_sha).splitlines()[0].strip()
    except (GitCommandError, IndexError) as exc:
        raise UnrelatedHistoriesError("Branches share no common ancestor") from exc

    files = _changed_files(repo, merge_base, source_sha)
    _fill_total_loc(clone_path, merge_base, source_sha, files)

    commit_count = int(repo.git.rev_list("--count", f"{merge_base}..{source_sha}").strip() or 0)
    authors = _authors(repo, merge_base, source_sha)

    total_additions = sum(f.additions for f in files)
    total_deletions = sum(f.deletions for f in files)
    test_files = [f for f in files if f.is_test]
    code_files = [f for f in files if not f.is_test]
    test_lines = sum(f.additions + f.deletions for f in test_files if not f.is_binary)
    code_lines = sum(f.additions + f.deletions for f in code_files if not f.is_binary)
    size = classify_size(len(files), code_lines)

    return Footprint(
        merge_base_sha=merge_base,
        source_sha=source_sha,
        target_sha=target_sha,
        commit_count=commit_count,
        author_count=len(authors),
        authors=authors,
        files=files,
        directories=_directories(files),
        total_additions=total_additions,
        total_deletions=total_deletions,
        files_changed=len(files),
        test_files_changed=len(test_files),
        code_files_changed=len(code_files),
        test_lines_changed=test_lines,
        code_lines_changed=code_lines,
        tests_to_code_ratio=round(test_lines / code_lines, 3) if code_lines else None,
        hotspot_paths_touched=[],
        size=size,
        efficient=is_efficient(size),
    )


def diff_excerpt(
    clone_path: Path | str,
    merge_base_sha: str,
    source_sha: str,
    files: list[FileFootprint],
    *,
    max_total_bytes: int = DEFAULT_MAX_TOTAL_BYTES,
    max_file_bytes: int = DEFAULT_MAX_FILE_BYTES,
    max_files: int = DEFAULT_MAX_FILES,
) -> str:
    """A bounded unified diff for AI prompts: code before tests, biggest churn first, binaries
    and generated/lock files skipped, hard caps per file and overall."""
    repo = Repo(clone_path)
    ordered = sorted(
        (f for f in files if not f.is_binary and not _excerpt_denied(f.path)),
        key=lambda f: (f.is_test, -(f.additions + f.deletions)),
    )
    chunks: list[str] = []
    used = 0
    included = 0
    for f in ordered:
        if included >= max_files or used >= max_total_bytes:
            break
        pathspec = [f.path] if f.old_path is None else [f.old_path, f.path]
        try:
            text = repo.git.diff("-M", merge_base_sha, source_sha, "--", *pathspec)
        except GitCommandError:
            continue
        if not text:
            continue
        if len(text) > max_file_bytes:
            text = text[:max_file_bytes] + "\n... [truncated]"
        chunks.append(text)
        used += len(text)
        included += 1
    omitted = len(files) - included
    if omitted > 0:
        chunks.append(f"({omitted} more files omitted — see the footprint table)")
    return "\n\n".join(chunks)


def _fetch(repo: Repo, provider_is_local: bool) -> bool:
    if provider_is_local:
        return False
    origin = next((r for r in repo.remotes if r.name == "origin"), None)
    if origin is None:
        return False
    try:
        origin.fetch(prune=True, kill_after_timeout=_FETCH_TIMEOUT_SECONDS)
        return True
    except GitCommandError:
        return False  # offline / slow remote — diff whatever is on disk


def _changed_files(repo: Repo, merge_base: str, source_sha: str) -> list[FileFootprint]:
    """Merge `--numstat` (line counts) with `--name-status` (A/M/D/R flags + rename old path)."""
    status_by_path = _name_status(repo, merge_base, source_sha)

    files: list[FileFootprint] = []
    raw = repo.git.diff("--numstat", "-M", "-z", merge_base, source_sha)
    tokens = raw.split("\x00")
    i = 0
    while i < len(tokens):
        entry = tokens[i]
        if not entry:
            i += 1
            continue
        adds_str, dels_str, path = entry.split("\t", 2)
        old_path: str | None = None
        if path == "":  # rename: the two paths follow as separate NUL-separated tokens
            old_path, path = tokens[i + 1], tokens[i + 2]
            i += 3
        else:
            i += 1
        is_binary = adds_str == "-"
        additions = 0 if is_binary else int(adds_str)
        deletions = 0 if is_binary else int(dels_str)
        letter, status_old = status_by_path.get(path, ("M", None))
        files.append(
            FileFootprint(
                path=path,
                old_path=old_path or status_old,
                additions=additions,
                deletions=deletions,
                is_binary=is_binary,
                is_new=letter == "A",
                is_deleted=letter == "D",
                is_test=is_test_path(path),
            )
        )
    return files


def _name_status(repo: Repo, merge_base: str, source_sha: str) -> dict[str, tuple[str, str | None]]:
    """path → (status letter, old_path) from `--name-status -z` (renames keyed on the new path)."""
    raw = repo.git.diff("--name-status", "-M", "-z", merge_base, source_sha)
    tokens = raw.split("\x00")
    result: dict[str, tuple[str, str | None]] = {}
    i = 0
    while i < len(tokens):
        status = tokens[i]
        if not status:
            i += 1
            continue
        letter = status[0]
        if letter in ("R", "C"):
            old, new = tokens[i + 1], tokens[i + 2]
            result[new] = (letter, old)
            i += 3
        else:
            result[tokens[i + 1]] = (letter, None)
            i += 2
    return result


def _fill_total_loc(
    clone_path: Path | str, merge_base: str, source_sha: str, files: list[FileFootprint]
) -> None:
    """Current LOC per changed file via one `git cat-file --batch` process. Deleted files are
    sized from their merge-base blob so the chart's "file size" bar stays meaningful; binaries
    stay None."""
    wanted = [f for f in files if not f.is_binary]
    if not wanted:
        return
    requests = [f"{merge_base if f.is_deleted else source_sha}:{f.path}".encode() for f in wanted]
    proc = subprocess.run(
        ["git", "cat-file", "--batch"],
        input=b"\n".join(requests) + b"\n",
        cwd=str(clone_path),
        capture_output=True,
        check=False,
    )
    out = proc.stdout
    pos = 0
    for f in wanted:
        newline = out.find(b"\n", pos)
        if newline == -1:
            break
        header = out[pos:newline].decode(errors="replace").split()
        pos = newline + 1
        if len(header) == 3 and header[1] == "blob":
            size = int(header[2])
            blob = out[pos : pos + size]
            f.total_loc = blob.count(b"\n") + (1 if blob and not blob.endswith(b"\n") else 0)
            pos += size + 1  # trailing newline after each object
        # "<oid> missing" (or non-blob) — leave total_loc None, no content follows


def _authors(repo: Repo, merge_base: str, source_sha: str) -> list[str]:
    """Distinct author display names in the range, split identities merged (newest spelling wins:
    the log is newest-first and the first spelling seen per identity is kept)."""
    raw = repo.git.log("--format=%aN%x00%aE", f"{merge_base}..{source_sha}")
    entries = [_Author(*line.split("\x00", 1)) for line in raw.splitlines() if "\x00" in line]
    key_of = _author_key_resolver(entries)
    names: dict[str, str] = {}
    for entry in entries:
        names.setdefault(key_of(entry), entry.author_name)
    return list(names.values())


def _directories(files: list[FileFootprint]) -> list[DirectoryFootprint]:
    """Aggregate by the first two path segments ("." for root files), heaviest churn first."""
    agg: dict[str, dict[str, int]] = {}
    for f in files:
        bucket = agg.setdefault(_dir_of(f.path), {"files": 0, "adds": 0, "dels": 0})
        bucket["files"] += 1
        bucket["adds"] += f.additions
        bucket["dels"] += f.deletions
    ordered = sorted(agg.items(), key=lambda kv: -(kv[1]["adds"] + kv[1]["dels"]))
    return [
        DirectoryFootprint(
            directory=d, files_changed=v["files"], additions=v["adds"], deletions=v["dels"]
        )
        for d, v in ordered
    ]


def _dir_of(path: str) -> str:
    """The aggregation bucket for a file: its first two path segments ("." for root files)."""
    parts = path.split("/")
    if len(parts) == 1:
        return "."
    return "/".join(parts[:2]) if len(parts) > 2 else parts[0]


def _excerpt_denied(path: str) -> bool:
    name = path.rsplit("/", 1)[-1]
    if name in _EXCERPT_DENY_NAMES:
        return True
    return any(fnmatch.fnmatch(name, pattern) for pattern in _EXCERPT_DENY_GLOBS)
