"""Best-effort GitHub metadata client (optional; degrades gracefully)."""

from __future__ import annotations

import httpx

from shire.domain.repository.domain import GitProvider, ProviderMetadata, RepoCoordinates


class GithubProviderClient:
    def __init__(self, token: str | None = None) -> None:
        self._token = token

    def fetch_metadata(self, url: str) -> ProviderMetadata | None:
        try:
            _repo_url, coordinates = _parse(url)
        except ValueError:
            return None
        if coordinates.provider is not GitProvider.github:
            return None

        headers = {"Accept": "application/vnd.github+json"}
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        api = f"https://api.github.com/repos/{coordinates.owner}/{coordinates.name}"
        try:
            resp = httpx.get(api, headers=headers, timeout=10.0)
            resp.raise_for_status()
        except httpx.HTTPError:
            return None
        data = resp.json()
        return ProviderMetadata(
            default_branch=data.get("default_branch"),
            description=data.get("description"),
        )


def _parse(url: str) -> tuple[str, RepoCoordinates]:
    from shire.domain.repository.domain import RepoUrl

    repo_url, coordinates = RepoUrl.parse(url)
    return repo_url.value, coordinates
