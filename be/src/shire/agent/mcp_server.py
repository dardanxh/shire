"""MCP server exposing the Hobits context layer + code drill-down to a Claude agent.

Three layers, one tool each:
  - `get_repo_context` — the precomputed context pack (Layer 1). The agent's first read.
  - `search_code`      — ranked keyword hits over the clone (Layer 2). Upgrades to pgvector
                         semantic search later without a signature change.
  - `read_file`        — an exact file slice from the clone (Layer 3).

The pack is fetched from the running backend (single source of truth); file operations run directly
against the local clone (this server is assumed to sit on the same host as the clones).

Run over stdio:  uv run python -m shire.agent.mcp_server
Register:        claude mcp add shire -- uv run python -m shire.agent.mcp_server
Config:          SHIRE_API_BASE (default http://localhost:8000)
"""

from __future__ import annotations

import os
import subprocess
import uuid
from pathlib import Path

import httpx
from mcp.server.fastmcp import FastMCP

API_BASE = os.environ.get("SHIRE_API_BASE", "http://localhost:8000").rstrip("/")
API = f"{API_BASE}/api/v1"
_TIMEOUT = 60.0

mcp = FastMCP("shire")


# --- helpers ------------------------------------------------------------------


def _client() -> httpx.Client:
    return httpx.Client(timeout=_TIMEOUT)


def _resolve_repo_id(client: httpx.Client, repo: str) -> str:
    """Accept a repository UUID or an `owner/name` (or bare `name`) slug."""
    try:
        uuid.UUID(repo)
        return repo
    except ValueError:
        pass
    resp = client.get(f"{API}/repositories", params={"limit": 500})
    resp.raise_for_status()
    items = resp.json().get("items", [])
    for it in items:
        if repo in (it.get("slug"), it.get("name")):
            return it["id"]
    raise ValueError(f"No repository matching {repo!r}. Call list_repos to see available repos.")


def _clone_root(client: httpx.Client, repo_id: str) -> Path:
    resp = client.get(f"{API}/repositories/{repo_id}/context", params={"format": "json"})
    resp.raise_for_status()
    clone_path = resp.json().get("identity", {}).get("clone_path")
    if not clone_path:
        raise ValueError("Repository has no local clone yet — ingest/analyze it first.")
    return Path(clone_path).resolve()


# --- tools --------------------------------------------------------------------


@mcp.tool()
def list_repos() -> str:
    """List tracked repositories (id, slug, ingestion status) for discovery."""
    with _client() as client:
        resp = client.get(f"{API}/repositories", params={"limit": 500})
        resp.raise_for_status()
        items = resp.json().get("items", [])
    if not items:
        return "No repositories tracked yet."
    return "\n".join(f"- {it['slug']}  [{it['status']}]  id={it['id']}" for it in items)


@mcp.tool()
def get_repo_context(repo: str) -> str:
    """Get the precomputed context pack for a repository — its whole current snapshot in one call.

    This is the first thing to read about a repo: ratings, facts, complexity/security/test
    metrics, top vulnerabilities, people, hotspots, coupling, dependencies, and which tools have
    (and haven't) run. `repo` is a repository UUID or an `owner/name` slug. Returns Markdown.
    """
    with _client() as client:
        repo_id = _resolve_repo_id(client, repo)
        resp = client.get(
            f"{API}/repositories/{repo_id}/context", params={"format": "markdown"}
        )
        resp.raise_for_status()
        return resp.text


@mcp.tool()
def search_code(repo: str, query: str, k: int = 10) -> str:
    """Search a repository's code for `query` and return up to `k` ranked file:line matches.

    Drill down here when the context pack isn't enough to answer "where does X happen?". Currently a
    keyword scan (ripgrep) over the local clone; the signature is stable for a future upgrade to
    semantic (vector) search.
    """
    with _client() as client:
        repo_id = _resolve_repo_id(client, repo)
        root = _clone_root(client, repo_id)
    hits = _ripgrep(root, query, k)
    if not hits:
        return f"No matches for {query!r}."
    return "\n".join(hits)


@mcp.tool()
def read_file(repo: str, path: str, start_line: int = 1, end_line: int | None = None) -> str:
    """Read an exact slice of a file from a repository's clone (1-based, inclusive line range).

    The deepest drill-down layer. `path` is relative to the repository root; traversal outside the
    clone is rejected.
    """
    with _client() as client:
        repo_id = _resolve_repo_id(client, repo)
        root = _clone_root(client, repo_id)

    target = (root / path).resolve()
    if not target.is_relative_to(root):
        raise ValueError("path escapes the repository root")
    if not target.is_file():
        raise ValueError(f"Not a file: {path}")

    lines = target.read_text(encoding="utf-8", errors="replace").splitlines()
    start = max(1, start_line)
    end = len(lines) if end_line is None else min(end_line, len(lines))
    selected = lines[start - 1 : end]
    width = len(str(end))
    return "\n".join(f"{start + n:>{width}}  {line}" for n, line in enumerate(selected))


# --- keyword search (ripgrep, python fallback) --------------------------------

_SEARCH_EXCLUDE = {".git", "node_modules", ".venv", "venv", "dist", "build", "__pycache__"}


def _ripgrep(root: Path, query: str, k: int) -> list[str]:
    try:
        proc = subprocess.run(
            [
                "rg", "--line-number", "--no-heading", "--color", "never",
                "--max-count", "5", "--", query, str(root),
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        out = proc.stdout
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return _python_search(root, query, k)
    hits: list[str] = []
    for line in out.splitlines():
        rel = line.replace(f"{root}/", "", 1)
        hits.append(rel)
        if len(hits) >= k:
            break
    return hits


def _python_search(root: Path, query: str, k: int) -> list[str]:
    needle = query.lower()
    hits: list[str] = []
    for file in root.rglob("*"):
        if not file.is_file() or any(part in _SEARCH_EXCLUDE for part in file.parts):
            continue
        try:
            text = file.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            if needle in line.lower():
                hits.append(f"{file.relative_to(root)}:{lineno}:{line.strip()[:200]}")
                if len(hits) >= k:
                    return hits
    return hits


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
