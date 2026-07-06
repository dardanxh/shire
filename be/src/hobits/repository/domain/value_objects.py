"""Value objects for the Repository bounded context."""

from __future__ import annotations

import re
from enum import StrEnum

from hobits.shared.domain.base import ValueObject


class GitProvider(StrEnum):
    github = "github"
    gitlab = "gitlab"
    bitbucket = "bitbucket"
    generic = "generic"


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


class RepoCoordinates(ValueObject):
    """Natural key for a repository."""

    provider: GitProvider
    owner: str
    name: str

    @property
    def slug(self) -> str:
        return f"{self.owner}/{self.name}"


class RepoUrl(ValueObject):
    """A validated git clone URL that can derive coordinates."""

    value: str

    @classmethod
    def parse(cls, raw: str) -> tuple[RepoUrl, RepoCoordinates]:
        raw = raw.strip()
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
