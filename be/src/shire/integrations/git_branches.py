"""Live branch inspection against a local clone (GitPython-backed).

Everything reads the clone on disk; the only network I/O is a best-effort `fetch --prune` so
remote-tracking refs mirror the remote. Git work is bounded: one `for-each-ref` enumerates all
branches, one `branch --merged` builds the merged set, and per-branch plumbing (ahead/behind,
squash detection) runs only for the top `limit` rows.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from git import GitCommandError, Repo

from shire.domain.repository.domain import BranchInspection, BranchStatus, BranchTip
from shire.integrations.scanners.git import _author_key_resolver

_MAX_BRANCHES = 1000  # bound Python-side parsing on pathological repos
_FETCH_TIMEOUT_SECONDS = 10
_FOR_EACH_REF_FORMAT = (
    "%(refname:short)%00%(objectname)%00%(committerdate:iso8601-strict)"
    "%00%(authorname)%00%(authoremail:trim)%00%(symref)"
)
# Fixed identity for the synthetic commit in squash detection: `commit-tree` needs an
# author/committer, and the host running the server may have none configured.
_SYNTHETIC_ENV = {
    "GIT_AUTHOR_NAME": "shire",
    "GIT_AUTHOR_EMAIL": "shire@localhost",
    "GIT_COMMITTER_NAME": "shire",
    "GIT_COMMITTER_EMAIL": "shire@localhost",
    "GIT_AUTHOR_DATE": "2000-01-01T00:00:00+00:00",
    "GIT_COMMITTER_DATE": "2000-01-01T00:00:00+00:00",
}


@dataclass
class _RawTip:
    name: str
    sha: str
    committed_at: datetime
    author_name: str
    author_email: str


def inspect_branches(
    clone_path: Path,
    default_branch: str,
    *,
    provider_is_local: bool,
    limit: int = 10,
    stale_days: int = 90,
) -> BranchInspection:
    repo = Repo(clone_path)
    fetched = _fetch(repo, provider_is_local)

    # Remote-tracking refs mirror the remote post-prune; local-source repos (and clones that
    # somehow lack origin refs) fall back to local heads.
    use_remote = not provider_is_local and any(r.name == "origin" for r in repo.remotes)
    entries = _enumerate(repo, use_remote)
    if not entries and use_remote:
        use_remote = False
        entries = _enumerate(repo, use_remote)

    now = datetime.now(UTC)
    total = len(entries)
    truncated = total > _MAX_BRANCHES
    entries = entries[:_MAX_BRANCHES]

    default_ref = _resolve_default_ref(repo, default_branch, use_remote)
    merged_names = _merged_names(repo, default_ref, use_remote) if default_ref else set()
    stale_cutoff = now - timedelta(days=stale_days)

    merged_count = sum(1 for e in entries if e.name != default_branch and e.name in merged_names)
    stale_count = sum(
        1
        for e in entries
        if e.name != default_branch and e.name not in merged_names and e.committed_at < stale_cutoff
    )

    top = entries[:limit]
    display_authors = _canonical_authors(top)
    ref_prefix = "refs/remotes/origin/" if use_remote else "refs/heads/"

    branches: list[BranchTip] = []
    for tip, (author_name, author_email) in zip(top, display_authors, strict=True):
        is_default = tip.name == default_branch
        branch_ref = ref_prefix + tip.name
        ahead: int | None = None
        behind: int | None = None
        merged: bool | None = None
        squash_merged: bool | None = None
        if default_ref is not None:
            merged = tip.name in merged_names
            ahead, behind = _ahead_behind(repo, default_ref, branch_ref)
            if not is_default and not merged:
                squash_merged = _squash_merged(repo, default_ref, branch_ref)

        if is_default:
            status = BranchStatus.default
        elif merged or squash_merged:
            status = BranchStatus.merged
        elif tip.committed_at < stale_cutoff:
            status = BranchStatus.stale
        else:
            status = BranchStatus.active

        branches.append(
            BranchTip(
                name=tip.name,
                is_default=is_default,
                last_commit_sha=tip.sha,
                last_commit_at=tip.committed_at,
                author_name=author_name,
                author_email=author_email,
                ahead=ahead,
                behind=behind,
                merged=merged,
                squash_merged=squash_merged,
                status=status,
            )
        )

    return BranchInspection(
        total_branches=total,
        merged_count=merged_count,
        stale_count=stale_count,
        stale_days=stale_days,
        fetched=fetched,
        truncated=truncated,
        as_of=now,
        branches=branches,
    )


def list_branch_names(clone_path: Path, *, provider_is_local: bool) -> list[str]:
    """Every branch name, most recently committed first — the cheap full list for pickers
    (the full `inspect_branches` returns only the most active tips, with per-branch plumbing)."""
    repo = Repo(clone_path)
    _fetch(repo, provider_is_local)
    use_remote = not provider_is_local and any(r.name == "origin" for r in repo.remotes)
    entries = _enumerate(repo, use_remote)
    if not entries and use_remote:
        entries = _enumerate(repo, False)
    return [e.name for e in entries[:_MAX_BRANCHES]]


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
        return False  # offline / slow remote — inspect whatever is on disk


def _enumerate(repo: Repo, use_remote: bool) -> list[_RawTip]:
    ref_space = "refs/remotes/origin" if use_remote else "refs/heads"
    out = repo.git.for_each_ref(
        "--sort=-committerdate", f"--format={_FOR_EACH_REF_FORMAT}", ref_space
    )
    tips: list[_RawTip] = []
    for line in out.splitlines():
        parts = line.split("\x00")
        if len(parts) != 6:
            continue
        name, sha, date_str, author_name, author_email, symref = parts
        if symref:  # e.g. origin/HEAD — a pointer, not a branch
            continue
        if use_remote:
            name = name.removeprefix("origin/")
        try:
            committed_at = datetime.fromisoformat(date_str)
        except ValueError:
            continue
        tips.append(_RawTip(name, sha, committed_at, author_name, author_email))
    return tips


def _resolve_default_ref(repo: Repo, default_branch: str, use_remote: bool) -> str | None:
    candidates = [f"refs/remotes/origin/{default_branch}"] if use_remote else []
    candidates += [f"refs/heads/{default_branch}", "HEAD"]
    for ref in candidates:
        try:
            repo.git.rev_parse("--verify", "--quiet", f"{ref}^{{commit}}")
            return ref
        except GitCommandError:
            continue
    return None


def _merged_names(repo: Repo, default_ref: str, use_remote: bool) -> set[str]:
    """Branch names whose tips are ancestors of the default branch — `merge-base --is-ancestor`
    semantics for every branch in one call."""
    args = ("-r", "--merged", default_ref) if use_remote else ("--merged", default_ref)
    try:
        out = repo.git.branch(*args)
    except GitCommandError:
        return set()
    names: set[str] = set()
    for line in out.splitlines():
        entry = line.strip().lstrip("*+ ").strip()
        if not entry or "->" in entry:  # skip "origin/HEAD -> origin/main"
            continue
        if use_remote:
            entry = entry.removeprefix("origin/")
        names.add(entry)
    return names


def _ahead_behind(repo: Repo, default_ref: str, branch_ref: str) -> tuple[int | None, int | None]:
    try:
        out = repo.git.rev_list("--left-right", "--count", f"{default_ref}...{branch_ref}")
        behind_str, ahead_str = out.split()
        return int(ahead_str), int(behind_str)
    except (GitCommandError, ValueError):
        return None, None


def _squash_merged(repo: Repo, default_ref: str, branch_ref: str) -> bool | None:
    """True when the branch's cumulative diff already exists on the default branch.

    The git-delete-squashed technique: squash the whole branch onto its merge-base as one
    synthetic (dangling) commit, then let `git cherry` patch-id-compare it against the default
    branch. A leading "-" means an equivalent patch landed there via squash or rebase.
    """
    try:
        base = repo.git.merge_base(default_ref, branch_ref).splitlines()[0].strip()
        tree = repo.git.rev_parse(f"{branch_ref}^{{tree}}")
        with repo.git.custom_environment(**_SYNTHETIC_ENV):
            synthetic = repo.git.commit_tree(tree, "-p", base, "-m", "_")
        return repo.git.cherry(default_ref, synthetic).strip().startswith("-")
    except (GitCommandError, IndexError):
        return None


def _canonical_authors(tips: list[_RawTip]) -> list[tuple[str, str]]:
    """Display (name, email) per tip: tips whose authors are the same person under split
    identities (per `_author_key_resolver`) all show the most recent tip's spelling."""
    key_of = _author_key_resolver(tips)
    latest: dict[str, _RawTip] = {}
    for tip in tips:
        key = key_of(tip)
        if key not in latest or tip.committed_at > latest[key].committed_at:
            latest[key] = tip
    return [(latest[key_of(tip)].author_name, latest[key_of(tip)].author_email) for tip in tips]
