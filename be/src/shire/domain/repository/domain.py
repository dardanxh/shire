"""Repository bounded-context domain: the Repository aggregate, its value objects, and ports.

The domain never imports SQLAlchemy, GitPython, or httpx — it declares what it needs (ports);
`integrations/` and this domain's `repositories.py` implement them.
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import Protocol

from shire.core.domain_base import AggregateRoot, ValueObject

# --- value objects ------------------------------------------------------------


class GitProvider(StrEnum):
    github = "github"
    gitlab = "gitlab"
    bitbucket = "bitbucket"
    generic = "generic"
    # A repository already on disk (has a .git), analyzed in place — no clone, no credentials.
    local = "local"


class IngestionStatus(StrEnum):
    registered = "registered"
    cloning = "cloning"
    analyzing = "analyzing"
    ready = "ready"
    failed = "failed"


_HOST_TO_PROVIDER = {
    "github.com": GitProvider.github,
    "gitlab.com": GitProvider.gitlab,
    "bitbucket.org": GitProvider.bitbucket,
}

# https://host/owner/name(.git)  |  git@host:owner/name(.git)
_HTTPS_RE = re.compile(r"^https?://(?P<host>[^/]+)/(?P<path>.+?)(?:\.git)?/?$")
_SSH_RE = re.compile(r"^git@(?P<host>[^:]+):(?P<path>.+?)(?:\.git)?/?$")
# An absolute filesystem path: POSIX ("/Users/me/repo") or Windows ("C:\code\repo").
_LOCAL_PATH_RE = re.compile(r"^(?:/|~/|[A-Za-z]:[\\/])")


class RepoCoordinates(ValueObject):
    """Natural key for a repository record.

    `subpath` scopes a record to a subdirectory of the repo (monorepo support): the same
    provider/owner/name can be onboarded once per subdirectory, each with its own scorecard,
    artifacts, and agent runs. Empty string = the whole repository. The clone on disk is
    keyed by provider/owner/name only, so sibling records share one clone.
    """

    provider: GitProvider
    owner: str
    name: str
    subpath: str = ""

    @property
    def slug(self) -> str:
        base = f"{self.owner}/{self.name}"
        return f"{base}/{self.subpath}" if self.subpath else base


class RepoUrl(ValueObject):
    """A validated git clone URL that can derive coordinates."""

    value: str

    @classmethod
    def parse(cls, raw: str) -> tuple[RepoUrl, RepoCoordinates]:
        raw = raw.strip()
        if _LOCAL_PATH_RE.match(raw):
            return cls._parse_local(raw)
        match = _HTTPS_RE.match(raw) or _SSH_RE.match(raw)
        if not match:
            raise ValueError(f"Unrecognized git URL: {raw!r}")

        host = match.group("host").lower()
        path = match.group("path").strip("/")
        segments = [s for s in path.split("/") if s]
        if len(segments) < 2:
            raise ValueError(f"Cannot derive owner/name from URL: {raw!r}")

        provider = _HOST_TO_PROVIDER.get(host, GitProvider.generic)
        owner, name = segments[-2], segments[-1]
        coordinates = RepoCoordinates(provider=provider, owner=owner, name=name)
        return cls(value=raw), coordinates

    @classmethod
    def _parse_local(cls, raw: str) -> tuple[RepoUrl, RepoCoordinates]:
        """Coordinates for a local repo path. `name` is the repo directory, `owner` its parent
        (or "local" at the filesystem root) — enough for a stable natural key + display slug."""
        path = raw.rstrip("/\\")
        segments = [s for s in re.split(r"[\\/]+", path) if s and not s.endswith(":")]
        if not segments:
            raise ValueError(f"Cannot derive a repository name from path: {raw!r}")
        name = segments[-1]
        owner = segments[-2] if len(segments) >= 2 else "local"
        coordinates = RepoCoordinates(provider=GitProvider.local, owner=owner, name=name)
        return cls(value=path), coordinates


# --- aggregate ----------------------------------------------------------------


def _now() -> datetime:
    return datetime.now(UTC)


class Repository(AggregateRoot):
    """A tracked codebase and its ingestion lifecycle.

    Invariants enforced by the transition methods:
    - a clone path must be recorded before analysis begins;
    - `failed` is reachable from any active state and records the error.
    """

    coordinates: RepoCoordinates
    url: RepoUrl
    connection_id: uuid.UUID | None = None
    default_branch: str = "main"
    # The branch the clone is checked out on (the "active" branch all analysis reflects).
    # None on rows predating branch awareness — readers fall back to default_branch.
    current_branch: str | None = None
    clone_path: str | None = None
    status: IngestionStatus = IngestionStatus.registered
    # Watchlist membership + the digest review cursor (see watchlist domain).
    watched: bool = False
    # Favourite flag driving the list's Starred tab — independent of `watched`.
    starred: bool = False
    last_reviewed_commit_sha: str | None = None
    prev_reviewed_commit_sha: str | None = None
    last_analyzed_commit: str | None = None
    last_analyzed_at: datetime | None = None
    error: str | None = None
    created_at: datetime = None  # type: ignore[assignment]
    updated_at: datetime = None  # type: ignore[assignment]

    def model_post_init(self, _context: object) -> None:
        now = _now()
        if self.created_at is None:
            self.created_at = now
        if self.updated_at is None:
            self.updated_at = now

    # --- lifecycle transitions -------------------------------------------------
    @property
    def analysis_path(self) -> str | None:
        """Where analysis and agent runs happen: the clone root, or the focused subdirectory
        for monorepo records. Git-level operations (clone/refresh/branches/worktrees/history)
        keep using `clone_path` — that's where `.git` lives."""
        if self.clone_path is None:
            return None
        sub = self.coordinates.subpath
        return f"{self.clone_path.rstrip('/')}/{sub}" if sub else self.clone_path

    def mark_cloning(self) -> None:
        self.status = IngestionStatus.cloning
        self.error = None
        self._touch()

    def mark_cloned(
        self, clone_path: str, default_branch: str, active_branch: str | None = None
    ) -> None:
        self.clone_path = clone_path
        self.default_branch = default_branch
        # Self-heals from the clone's actual checkout; a detached HEAD keeps the prior value.
        self.current_branch = active_branch or self.current_branch or default_branch
        self._touch()

    def mark_analyzing(self) -> None:
        if not self.clone_path:
            raise ValueError("Cannot analyze a repository that has not been cloned.")
        self.status = IngestionStatus.analyzing
        self._touch()

    def mark_ready(self, commit_sha: str) -> None:
        self.status = IngestionStatus.ready
        self.last_analyzed_commit = commit_sha
        self.last_analyzed_at = _now()
        self.error = None
        self._touch()

    def mark_failed(self, error: str) -> None:
        self.status = IngestionStatus.failed
        self.error = error
        self._touch()

    def _touch(self) -> None:
        self.updated_at = _now()


# --- ports --------------------------------------------------------------------


class ProviderMetadata(ValueObject):
    default_branch: str | None = None
    description: str | None = None


class CloneOutcome(ValueObject):
    clone_path: str
    default_branch: str
    head_sha: str
    # The branch actually checked out after the operation; None on a detached HEAD.
    active_branch: str | None = None


class BranchStatus(StrEnum):
    default = "default"
    merged = "merged"
    stale = "stale"
    active = "active"


class BranchTip(ValueObject):
    """One branch as seen from its tip commit.

    `merged` is the ancestor check against the default branch (a true merge happened — safe to
    delete). `squash_merged` is the patch-equivalence check that also catches squash/rebase
    merges; it is only computed for listed, not-already-merged branches (None = not checked or
    check failed). Either being true yields `status = merged`.
    """

    name: str
    is_default: bool
    last_commit_sha: str
    last_commit_at: datetime
    author_name: str
    author_email: str
    ahead: int | None
    behind: int | None
    merged: bool | None
    squash_merged: bool | None
    status: BranchStatus


class BranchInspection(ValueObject):
    """Live branch overview computed from the clone on disk.

    `merged_count`/`stale_count` use the cheap ancestor check across all enumerated branches;
    squash-merge detection upgrades only the listed top branches (it costs git plumbing calls
    per branch).
    """

    total_branches: int
    merged_count: int
    stale_count: int
    stale_days: int
    fetched: bool
    truncated: bool
    as_of: datetime
    branches: list[BranchTip]


class RepositoryRepository(Protocol):
    """Persistence port for the Repository aggregate."""

    def add(self, repository: Repository) -> None: ...
    def save(self, repository: Repository) -> None: ...
    def get(self, repository_id: uuid.UUID) -> Repository | None: ...
    def get_by_coordinates(self, coordinates: RepoCoordinates) -> Repository | None: ...
    def list(self, *, limit: int | None = None, offset: int = 0) -> list[Repository]: ...
    def count(self) -> int: ...
    # Family-scoped reads: a "family" is every record sharing provider/owner/name — the
    # whole-repo record plus the monorepo subpath records nested under it.
    def list_families(self, *, limit: int, offset: int) -> list[Repository]: ...
    def count_families(self) -> int: ...


class GitProviderClient(Protocol):
    """Fetches provider-side metadata (best-effort; may return None)."""

    def fetch_metadata(self, url: str) -> ProviderMetadata | None: ...


class CloneService(Protocol):
    """Clones (or updates) a repository into a local workspace."""

    def clone(
        self, url: str, coordinates: RepoCoordinates, branch: str | None = None
    ) -> CloneOutcome: ...
