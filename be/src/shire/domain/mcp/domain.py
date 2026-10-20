"""Parsing `claude mcp list` output — pure, so it is tested against real captured output."""

from __future__ import annotations

import re
from dataclasses import dataclass

# `<name>: <url or command> - <mark> <status words>`; the name itself may contain spaces/dots.
_LINE = re.compile(r"^(?P<name>[^:]+?):\s+(?P<target>.+?)\s+-\s+(?P<status>\S.*)$")


@dataclass(frozen=True)
class ProbedServer:
    name: str
    target: str
    status: str  # one of models.MCP_STATUSES
    status_detail: str


def classify(status_text: str) -> str:
    lowered = status_text.lower()
    if "needs authentication" in lowered or "needs auth" in lowered:
        return "needs_auth"
    if "failed" in lowered or "error" in lowered or "✗" in status_text:
        return "failed"
    if "connected" in lowered:
        return "connected"
    return "unknown"


def parse_mcp_list(output: str) -> list[ProbedServer]:
    servers: list[ProbedServer] = []
    for raw in (output or "").splitlines():
        line = raw.strip()
        if not line or line.startswith("Checking MCP server health"):
            continue
        match = _LINE.match(line)
        if match is None:
            continue
        status_text = match.group("status").strip()
        servers.append(ProbedServer(
            name=match.group("name").strip(),
            target=match.group("target").strip(),
            status=classify(status_text),
            status_detail=status_text.lstrip("✔✓✗!⚠ ").strip()[:200],
        ))
    return servers


# --- tool safety ---------------------------------------------------------------------------

# Verbs that change state somewhere. Matched against the tool part of `mcp__server__tool`,
# split on camelCase / snake_case boundaries so `getJiraIssue` isn't caught by "issue" etc.
_WRITE_VERBS = frozenset({
    "add", "append", "apply", "approve", "archive", "assign", "cancel", "close", "complete",
    "copy", "create", "delete", "destructive", "dismiss", "edit", "fork", "format", "grant",
    "import", "insert", "invite", "lock", "manage", "merge", "modify", "move", "post",
    "publish", "push", "remove", "rename", "replace", "reply", "resize", "resolve", "revoke",
    "send", "set", "share", "submit", "sync", "transition", "trigger", "update", "upload",
    "upsert", "write",
})
_TOKEN = re.compile(r"[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+")


def server_tool_prefix(server_name: str) -> str:
    """`claude.ai PPRO Atlassian` → `mcp__claude_ai_PPRO_Atlassian` (the CLI's tool prefix)."""
    return "mcp__" + re.sub(r"[^A-Za-z0-9_-]", "_", server_name)


def is_write_tool(tool_name: str) -> bool:
    tool = tool_name.rsplit("__", 1)[-1]
    words = {w.lower() for w in _TOKEN.findall(tool)}
    return bool(words & _WRITE_VERBS)
