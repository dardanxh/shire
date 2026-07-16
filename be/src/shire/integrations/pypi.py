"""PyPI registry lookups for dependency freshness (Python/pip only).

Fetches each package's latest published version + release date from the PyPI JSON API and computes
how far a declared constraint is behind it. Network + concurrency live here; no domain imports.
"""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor

import httpx
from packaging.version import InvalidVersion, Version

_TIMEOUT = 10.0
_MAX_WORKERS = 12
# First version-looking token in a constraint string ("^2.22.0", ">=2019.6.16", "~=1.4" -> 2.22.0…).
_VERSION_RE = re.compile(r"\d[\w.\-]*")


# project_urls labels that point at a changelog / release notes.
_CHANGELOG_KEYS = ("changelog", "changes", "release note", "whatsnew", "history")


def _changelog_url(info: dict, name: str, version: str) -> str:
    """A changelog URL from the package metadata, else the PyPI release page."""
    for label, url in (info.get("project_urls") or {}).items():
        if url and any(k in label.lower() for k in _CHANGELOG_KEYS):
            return url
    return f"https://pypi.org/project/{name}/{version}/"


def latest(client: httpx.Client, name: str) -> tuple[str, str | None, str] | None:
    """(latest_version, released_at_iso, changelog_url) from PyPI, or None if unknown."""
    try:
        resp = client.get(f"https://pypi.org/pypi/{name}/json")
    except httpx.HTTPError:
        return None
    if resp.status_code != 200:
        return None
    try:
        data = resp.json()
    except ValueError:
        return None
    info = data.get("info") or {}
    version = info.get("version")
    if not version:
        return None
    urls = data.get("urls") or []
    released = urls[0].get("upload_time_iso_8601") if urls else None
    return version, released, _changelog_url(info, name, version)


def latest_many(names: list[str]) -> dict[str, tuple[str, str | None, str] | None]:
    """Latest version for many packages, fetched concurrently."""
    if not names:
        return {}
    with httpx.Client(timeout=_TIMEOUT) as client:

        def fetch(n: str) -> tuple[str, tuple[str, str | None, str] | None]:
            return n, latest(client, n)

        with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as pool:
            return dict(pool.map(fetch, names))


def base_version(constraint: str | None) -> str | None:
    """Strip a constraint to its floor version, e.g. '^2.22.0' or '>=2019.6.16' -> '2.22.0'."""
    if not constraint:
        return None
    match = _VERSION_RE.search(constraint)
    return match.group(0) if match else None


def compute_gap(current: str | None, latest_version: str | None) -> str:
    """Classify the distance between a declared floor and the latest release."""
    if not current or not latest_version:
        return "unknown"
    try:
        cur = Version(current)
        new = Version(latest_version)
    except InvalidVersion:
        return "unknown"
    if cur >= new:
        return "up-to-date"
    if new.major > cur.major:
        return "major"
    if new.minor > cur.minor:
        return "minor"
    return "patch"
