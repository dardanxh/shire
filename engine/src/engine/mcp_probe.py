"""The `mcp.probe` job: report which MCP servers this worker's CLI can reach, and their tools.

Not a prompt job — `claude mcp list` gives connection health (no tokens spent), then one cheap
`claude -p` turn enumerates the `mcp__*` tool names. The CLI's stream-json init event lists no
claude.ai connector tools (they attach after init), so the model's own view of its tool list is
the source — and it only enumerates reliably when asked for explicit server prefixes (a generic
"every mcp__ tool" question comes back empty), so the prompt names each connected server.

The backend handler uses the tool names to build per-action deny lists (write-type tools blocked
unless an action opts in), so this must run where actions run: the host runner.
"""

from __future__ import annotations

import json
import re
import subprocess
import time

from engine.claude_cli import ClaudeCliEngine, _claude_env
from engine.model import EngineRequest, EngineResult

PROBE_KIND = "mcp.probe"

_LIST_TIMEOUT_SECONDS = 180.0
_TOOLS_TIMEOUT_SECONDS = 180.0
_TOOL_NAME = re.compile(r"\bmcp__[A-Za-z0-9_-]+__[A-Za-z0-9_-]+\b")

_TOOLS_PROMPT = (
    "List only the names of tools available to you that start with any of these prefixes, "
    "one per line, nothing else:\n{prefixes}"
)
_CONNECTED_LINE = re.compile(r"^(?P<name>[^:]+?):\s+.+\s+-\s+\S*\s*Connected\s*$")

# Built-ins denied for the listing turn: it must only answer from its own tool list.
_DENY_BUILTINS = (
    "Bash", "Edit", "Glob", "Grep", "NotebookEdit", "Read", "Task", "TodoWrite",
    "WebFetch", "WebSearch", "Write",
)


def run_probe(
    *, binary: str, use_api_key: bool, cwd: str, model: str | None = "haiku"
) -> EngineResult:
    started = time.monotonic()
    try:
        proc = subprocess.run(
            [binary, "mcp", "list"],
            capture_output=True,
            text=True,
            timeout=_LIST_TIMEOUT_SECONDS,
            cwd=cwd,
            env=_claude_env(use_api_key=use_api_key),
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as exc:
        return EngineResult(
            ok=False, text="", error=f"`claude mcp list` failed: {exc}",
            duration_seconds=time.monotonic() - started,
        )
    if proc.returncode != 0:
        return EngineResult(
            ok=False, text="", error=f"`claude mcp list` exited {proc.returncode}: "
            f"{(proc.stderr or proc.stdout).strip()[:1000]}",
            duration_seconds=time.monotonic() - started,
        )

    listing = proc.stdout or ""
    tools: list[str] = []
    tools_error: str | None = None
    usage: dict | None = None
    prefixes = connected_prefixes(listing)
    # Only spend a model turn when there is something to enumerate.
    if prefixes:
        result = ClaudeCliEngine(binary=binary, use_api_key=use_api_key).run(
            EngineRequest(
                prompt=_TOOLS_PROMPT.format(prefixes="\n".join(prefixes)),
                cwd=cwd,
                allowed_tools=("ToolSearch",),
                disallowed_tools=_DENY_BUILTINS,
                model=model,
                timeout_seconds=_TOOLS_TIMEOUT_SECONDS,
            )
        )
        usage = result.usage
        if result.ok:
            tools = parse_tool_names(result.text)
        else:
            tools_error = result.error

    text = json.dumps({"list_output": listing, "tools": tools, "tools_error": tools_error})
    return EngineResult(
        ok=True, text=text, duration_seconds=time.monotonic() - started, usage=usage
    )


def parse_tool_names(text: str) -> list[str]:
    """Distinct `mcp__server__tool` names in first-seen order."""
    return list(dict.fromkeys(_TOOL_NAME.findall(text or "")))


def connected_prefixes(listing: str) -> list[str]:
    """Tool-name prefixes (`mcp__<server>`) of the servers `claude mcp list` reports connected."""
    prefixes = []
    for line in (listing or "").splitlines():
        match = _CONNECTED_LINE.match(line.strip())
        if match:
            prefixes.append("mcp__" + re.sub(r"[^A-Za-z0-9_-]", "_", match.group("name").strip()))
    return prefixes
