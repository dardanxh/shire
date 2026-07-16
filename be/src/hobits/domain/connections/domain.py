"""Connections bounded-context domain: the Connection aggregate, its credential value objects,
and ports.

A Connection is a named, reusable credential set for a git provider (GitHub / GitLab /
Bitbucket), authenticating either by token or by username + password/app-password. The domain
never imports SQLAlchemy or httpx — it declares ports; `integrations/git_providers/` and this
context's `repositories.py` implement them. The `GitProvider` enum is reused from the repository
context (single source of truth for provider identity).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import Protocol

from hobits.core.domain_base import AggregateRoot, ValueObject
from hobits.domain.repository.domain import GitProvider

# Providers that can hold a credential connection (excludes `generic`).
CONNECTABLE_PROVIDERS = (GitProvider.github, GitProvider.gitlab, GitProvider.bitbucket)


class AuthMethod(StrEnum):
    token = "token"
    basic = "basic"


def _now() -> datetime:
    return datetime.now(UTC)


# --- value objects ------------------------------------------------------------


class ProviderCredential(ValueObject):
    """The material an integration needs to authenticate against a provider."""

    provider: GitProvider
    auth_method: AuthMethod
    secret: str  # the raw token OR password/app-password
    username: str | None = None
    base_url: str | None = None  # self-hosted GitLab/Bitbucket / GitHub Enterprise API base


class TestResult(ValueObject):
    """Outcome of a live credential check against a provider."""

    ok: bool
    message: str
    account: str | None = None  # the login/username echoed back on success


class PullRequestRef(ValueObject):
    """A pull/merge request as the provider reports it (normalized across providers)."""

    number: int
    url: str
    state: str  # open | merged | closed


class IssueRef(ValueObject):
    """An issue created on the provider."""

    url: str


# --- aggregate ----------------------------------------------------------------


class Connection(AggregateRoot):
    """A named credential set for a git provider.

    `secret` holds the raw token/password in memory only; it is encrypted at the persistence
    boundary and never serialized into a result schema (only a `secret_hint` is exposed).
    """

    name: str
    provider: GitProvider
    auth_method: AuthMethod
    secret: str
    username: str | None = None
    base_url: str | None = None
    created_at: datetime = None  # type: ignore[assignment]
    updated_at: datetime = None  # type: ignore[assignment]

    def model_post_init(self, _context: object) -> None:
        now = _now()
        if self.created_at is None:
            self.created_at = now
        if self.updated_at is None:
            self.updated_at = now

    @property
    def secret_hint(self) -> str:
        """A non-reversible hint for the UI (last 4 chars), never the full secret."""
        secret = self.secret or ""
        return f"••••{secret[-4:]}" if len(secret) > 4 else "••••"

    def credential(self) -> ProviderCredential:
        return ProviderCredential(
            provider=self.provider,
            auth_method=self.auth_method,
            secret=self.secret,
            username=self.username,
            base_url=self.base_url,
        )

    def update(
        self,
        *,
        name: str,
        username: str | None,
        base_url: str | None,
        secret: str | None = None,
    ) -> None:
        """Apply an edit. A falsy `secret` means "keep the existing one"."""
        self.name = name
        self.username = username
        self.base_url = base_url
        if secret:
            self.secret = secret
        self.updated_at = _now()


# --- ports --------------------------------------------------------------------


class ConnectionRepository(Protocol):
    """Persistence port for the Connection aggregate."""

    def add(self, connection: Connection) -> None: ...
    def save(self, connection: Connection) -> None: ...
    def get(self, connection_id: uuid.UUID) -> Connection | None: ...
    def get_by_name(self, name: str) -> Connection | None: ...
    def list(self, *, limit: int | None = None, offset: int = 0) -> list[Connection]: ...
    def count(self) -> int: ...
    def delete(self, connection_id: uuid.UUID) -> None: ...


class GitProviderConnector(Protocol):
    """Talks to a provider on behalf of a credential: verifies it, authenticates clone URLs,
    and (where the provider supports it) manages pull requests and issues."""

    def test(self, credential: ProviderCredential) -> TestResult: ...
    def authenticated_url(self, url: str, credential: ProviderCredential) -> str: ...
    def create_pull_request(
        self,
        credential: ProviderCredential,
        owner: str,
        name: str,
        *,
        head: str,
        base: str,
        title: str,
        body: str,
    ) -> PullRequestRef: ...
    def get_pull_request(
        self, credential: ProviderCredential, owner: str, name: str, number: int
    ) -> PullRequestRef: ...
    def create_issue(
        self, credential: ProviderCredential, owner: str, name: str, *, title: str, body: str
    ) -> IssueRef: ...
