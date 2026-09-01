"""Detect new monorepo subprojects that aren't onboarded yet.

Deliberately convention-free: rather than parse workspace configs, we mirror the layout the
user already chose. Given the subpaths they onboarded (say ``apps/web`` and ``apps/api``), we
scan the *parent* folders those live in (``apps/``) for sibling directories that carry a project
manifest and aren't registered yet. So a newly added ``apps/worker`` surfaces on the next poll,
whatever the repo's package manager is.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import PurePosixPath

from shire.integrations.scanners.code import manifest_kind

# Never walk into these when scanning a parent folder for subprojects.
_IGNORED_DIRS = frozenset(
    {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", "target"}
)


@dataclass(frozen=True)
class SubprojectCandidate:
    """A directory that looks like an un-onboarded subproject."""

    subpath: str  # repo-relative, forward-slashed (e.g. "apps/worker")
    manifest: str  # the manifest kind that marked it a project (e.g. "package.json")


def _has_manifest(directory) -> str | None:
    """The manifest kind directly inside `directory` (non-recursive), or None. First match by
    sorted name so the result is stable."""
    try:
        entries = sorted(p for p in directory.iterdir() if p.is_file())
    except OSError:
        return None
    for entry in entries:
        kind = manifest_kind(entry.name)
        if kind is not None:
            return kind
    return None


def detect_new_subprojects(clone_path, existing_subpaths: set[str]) -> list[SubprojectCandidate]:
    """New subproject directories under the parents of the already-onboarded subrepos.

    `existing_subpaths` is every subpath in the family (including "" for the whole-repo record).
    Returns [] unless at least one real subrepo exists — we only complete a set the user already
    started, never explode a plain repo into subrepos. Candidates are the immediate children of
    each existing subrepo's parent folder that (a) carry a manifest and (b) aren't onboarded yet.
    """
    real = {s for s in existing_subpaths if s}
    if not real:
        return []

    # The folders that hold the user's subrepos — "apps/web" -> "apps", "backend" -> "" (root).
    parents = {str(PurePosixPath(s).parent) for s in real}
    parents = {"" if p == "." else p for p in parents}

    found: dict[str, SubprojectCandidate] = {}
    for parent in parents:
        parent_dir = clone_path / parent if parent else clone_path
        if not parent_dir.is_dir():
            continue
        try:
            children = sorted(p for p in parent_dir.iterdir() if p.is_dir())
        except OSError:
            continue
        for child in children:
            if child.name in _IGNORED_DIRS or child.name.startswith("."):
                continue
            subpath = f"{parent}/{child.name}" if parent else child.name
            if subpath in existing_subpaths or subpath in found:
                continue
            manifest = _has_manifest(child)
            if manifest is None:
                continue
            found[subpath] = SubprojectCandidate(subpath=subpath, manifest=manifest)
    return [found[key] for key in sorted(found)]
