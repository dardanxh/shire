"""Best-effort site-icon fetch for Launchpad bookmarks.

Fetched directly from the site (page `<link rel=icon>`, then `/favicon.ico`) — deliberately not
via a third-party favicon service, which would leak internal hostnames. Never raises: any failure
returns None and the bookmark falls back to a monogram.
"""

from __future__ import annotations

import logging
import re
from urllib.parse import urljoin, urlparse

import httpx

logger = logging.getLogger(__name__)

MAX_LOGO_BYTES = 256 * 1024
_TIMEOUT = httpx.Timeout(3.0)
_ICON_LINK = re.compile(r"<link\b[^>]*>", re.IGNORECASE)
_REL_ICON = re.compile(r"""rel\s*=\s*["'][^"']*\bicon\b[^"']*["']""", re.IGNORECASE)
_HREF = re.compile(r"""href\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
_HEADERS = {"User-Agent": "Mozilla/5.0 (Shire Launchpad favicon fetch)"}


def icon_candidates(page_url: str, html: str) -> list[str]:
    """Icon URLs declared by the page, `apple-touch-icon` (usually largest) first."""
    found: list[tuple[int, str]] = []
    for tag in _ICON_LINK.findall(html or ""):
        if not _REL_ICON.search(tag):
            continue
        href = _HREF.search(tag)
        if href is None:
            continue
        rank = 0 if "apple-touch-icon" in tag.lower() else 1
        found.append((rank, urljoin(page_url, href.group(1).strip())))
    return [url for _, url in sorted(found, key=lambda pair: pair[0])]


def fetch_favicon(url: str) -> tuple[bytes, str] | None:
    """(image bytes, mime type) or None."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None
    origin = f"{parsed.scheme}://{parsed.netloc}"
    try:
        with httpx.Client(timeout=_TIMEOUT, follow_redirects=True, headers=_HEADERS) as client:
            candidates: list[str] = []
            try:
                page = client.get(url)
                if "html" in page.headers.get("content-type", ""):
                    candidates = icon_candidates(str(page.url), page.text[:200_000])
            except httpx.HTTPError:
                pass
            candidates.append(f"{origin}/favicon.ico")
            for candidate in dict.fromkeys(candidates):
                image = _fetch_image(client, candidate)
                if image is not None:
                    return image
    except Exception:
        logger.debug("Favicon fetch failed for %s", url, exc_info=True)
    return None


def _fetch_image(client: httpx.Client, url: str) -> tuple[bytes, str] | None:
    if url.startswith("data:"):
        return None
    try:
        response = client.get(url)
    except httpx.HTTPError:
        return None
    mime = response.headers.get("content-type", "").split(";")[0].strip().lower()
    body = response.content
    if response.status_code != 200 or not body or len(body) > MAX_LOGO_BYTES:
        return None
    if not mime.startswith("image/"):
        # Many servers send .ico as octet-stream; trust the ICO magic bytes instead.
        if body[:4] == b"\x00\x00\x01\x00":
            mime = "image/x-icon"
        else:
            return None
    return body, mime
