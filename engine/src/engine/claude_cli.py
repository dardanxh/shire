"""Claude Code CLI engine (`claude -p`) — the default `Engine` implementation.

Ported from the backend's `ClaudeAgent` wrapper. Runs headlessly in a repo clone (or a
disposable worktree), on the logged-in Max subscription.

Design notes:
- **Never raises for expected failures** (missing binary, timeout, non-zero exit, unparseable
  output) — those come back as `EngineResult(ok=False, error=...)` so the job settles cleanly.
- **The allow-list is the permission boundary.** In `--print` mode, permission mode `default`
  auto-denies any tool outside `allowed_tools` (it can't prompt). Most kinds run read-only
  (Read/Grep/Glob); `roadmap.execute` grants Edit/Write inside a disposable git worktree —
  never Bash.
- **Auth.** By default `ANTHROPIC_API_KEY` is stripped from the env so the CLI uses the
  logged-in session rather than silently switching to paid API-key auth. Constructing with
  `use_api_key=True` (env `ENGINE_USE_API_KEY`) passes the key through — the zero-setup path
  for containerized deployments. `CLAUDE_CODE_OAUTH_TOKEN` always passes through.
- **Streamed transcript.** Runs with `--output-format stream-json` and forwards each assistant
  message / tool call as a compact event to the optional `on_event` callback — the Jobs UI's
  live "agent activity" feed. The final `result` event carries the same envelope (result text,
  usage) the old whole-stdout JSON mode did.
"""

from __future__ import annotations

import contextlib
import json
import os
import select
import subprocess
import time
from collections.abc import Callable, Iterator

from engine.model import EngineRequest, EngineResult

# Bounds on the compact transcript events (the full text still arrives via the result).
_TEXT_LIMIT = 4_000
_DETAIL_LIMIT = 300


class _TimeoutError(Exception):
    """The run exceeded its deadline (internal control flow, never escapes `run`)."""


class ClaudeCliEngine:
    def __init__(self, *, binary: str = "claude", use_api_key: bool = False) -> None:
        self._binary = binary
        self._use_api_key = use_api_key

    def available(self) -> bool:
        """True when the CLI is installed and answers `--version` quickly."""
        return self.version() is not None

    def version(self) -> str | None:
        """First line of `claude --version`, or None when the CLI is missing/unresponsive.
        Generous timeout: the CLI's very first run in a fresh container can be slow."""
        try:
            proc = subprocess.run(
                [self._binary, "--version"],
                capture_output=True,
                text=True,
                timeout=15,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            return None
        if proc.returncode != 0:
            return None
        out = (proc.stdout or "").strip()
        return out.splitlines()[0] if out else ""

    def run(
        self,
        request: EngineRequest,
        on_event: Callable[[dict], None] | None = None,
    ) -> EngineResult:
        argv = self._build_argv(request)
        started = time.monotonic()
        deadline = started + request.timeout_seconds
        try:
            proc = subprocess.Popen(
                argv,
                cwd=request.cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=_claude_env(use_api_key=self._use_api_key),
            )
        except (FileNotFoundError, NotADirectoryError, OSError) as exc:
            return EngineResult(
                ok=False,
                text="",
                error=f"could not launch '{self._binary}': {exc}",
                duration_seconds=time.monotonic() - started,
            )

        envelope: dict | None = None
        stray: list[str] = []  # non-JSON output, kept as the error-path fallback
        try:
            for line in _stream_lines(proc, deadline):
                raw = line.strip()
                if not raw:
                    continue
                try:
                    event = json.loads(raw)
                except json.JSONDecodeError:
                    stray.append(raw[:500])
                    continue
                if not isinstance(event, dict):
                    continue
                if event.get("type") == "result":
                    envelope = event
                elif on_event is not None:
                    # Progress is best-effort only — a bad callback must never kill the run.
                    for compact in _compact_events(event):
                        with contextlib.suppress(Exception):
                            on_event(compact)
        except _TimeoutError:
            proc.kill()
            proc.wait()
            return EngineResult(
                ok=False,
                text="",
                error=f"claude run timed out after {request.timeout_seconds:.0f}s",
                duration_seconds=time.monotonic() - started,
            )

        returncode = proc.wait()
        stderr = proc.stderr.read() if proc.stderr else ""
        duration = time.monotonic() - started

        if envelope is None:
            detail = (stderr or "\n".join(stray)).strip()[:2000]
            if returncode != 0:
                error = f"claude exited {returncode}: {detail}"
            else:
                error = "claude produced no result envelope"
            return EngineResult(
                ok=False, text="\n".join(stray), error=error, duration_seconds=duration
            )

        text, err = _extract_text(envelope)
        return EngineResult(
            ok=err is None,
            text=text,
            error=err,
            duration_seconds=duration,
            usage=_extract_usage(envelope),
        )

    def _build_argv(self, request: EngineRequest) -> list[str]:
        # --setting-sources "" isolates headless runs from ALL Claude Code settings files:
        # the operator's user-level hooks (a UserPromptSubmit hook would otherwise intercept
        # engine prompts) and any .claude settings inside the analyzed clone (untrusted input —
        # a repo must never inject hooks into our runs). Auth is unaffected.
        # stream-json requires --verbose in --print mode.
        argv = [
            self._binary,
            "-p",
            request.prompt,
            "--output-format",
            "stream-json",
            "--verbose",
            "--setting-sources",
            "",
        ]
        if request.model:
            argv += ["--model", request.model]
        if request.system:
            argv += ["--append-system-prompt", request.system]
        if request.allowed_tools:
            argv += ["--allowedTools", *request.allowed_tools]
        # In --print mode, `default` auto-denies non-allowed tools instead of prompting (which
        # would hang headlessly) — so the allow-list above is the actual permission boundary.
        argv += ["--permission-mode", "default"]
        return argv


def _stream_lines(proc: subprocess.Popen, deadline: float) -> Iterator[str]:
    """Yield stdout lines until EOF; raise _Timeout when the deadline passes.

    `select` on the pipe keeps the deadline enforceable even when the CLI goes quiet
    (a blocking readline would only notice the timeout on the next write).
    """
    stdout = proc.stdout
    if stdout is None:
        return
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise _TimeoutError
        readable, _, _ = select.select([stdout], [], [], min(remaining, 5.0))
        if not readable:
            continue
        line = stdout.readline()
        if line == "":
            return  # EOF — the process is finishing
        yield line


def _claude_env(*, use_api_key: bool) -> dict[str, str]:
    """Env for the run. Unless API-key auth is opted into, `ANTHROPIC_API_KEY` is stripped so
    the CLI uses the logged-in session rather than silently switching to paid API-key auth."""
    if use_api_key:
        return dict(os.environ)
    return {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}


def _compact_events(event: dict) -> list[dict]:
    """Squash one stream-json event into compact transcript entries for the progress feed."""
    entries: list[dict] = []
    event_type = event.get("type")
    message = event.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, list):
        return entries

    if event_type == "assistant":
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "text" and block.get("text"):
                entries.append({"type": "text", "text": str(block["text"])[:_TEXT_LIMIT]})
            elif block.get("type") == "tool_use":
                entries.append(
                    {
                        "type": "tool",
                        "tool": str(block.get("name") or "?"),
                        "detail": _tool_summary(block.get("name"), block.get("input")),
                    }
                )
    elif event_type == "user":
        for block in content:
            if isinstance(block, dict) and block.get("type") == "tool_result":
                detail = _tool_result_summary(block.get("content"))
                if detail:
                    entries.append(
                        {
                            "type": "tool_result",
                            "detail": detail,
                            "error": bool(block.get("is_error")),
                        }
                    )
    return entries


def _tool_summary(name: object, tool_input: object) -> str:
    """The one line that tells a human what the tool call is doing."""
    if not isinstance(tool_input, dict):
        return ""
    for key in ("file_path", "path", "pattern", "query", "url", "command", "notebook_path"):
        value = tool_input.get(key)
        if isinstance(value, str) and value:
            return value[:_DETAIL_LIMIT]
    try:
        return json.dumps(tool_input)[:_DETAIL_LIMIT]
    except (TypeError, ValueError):
        return ""


def _tool_result_summary(content: object) -> str:
    if isinstance(content, str):
        text = content
    elif isinstance(content, list):
        text = " ".join(
            str(block.get("text") or "")
            for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        )
    else:
        return ""
    return " ".join(text.split())[:160]


def _extract_usage(envelope: dict) -> dict | None:
    """Pull the session-cumulative token accounting out of the result envelope.

    The envelope's `usage` covers the entire `claude -p` session — every internal turn's
    prompt and completion — not just the final message. Returns a flat, engine-agnostic
    dict, or None when the envelope has no usage block.
    """
    usage = envelope.get("usage")
    if not isinstance(usage, dict):
        return None
    model_usage = envelope.get("modelUsage")
    return {
        "input_tokens": usage.get("input_tokens"),
        "output_tokens": usage.get("output_tokens"),
        "cache_creation_input_tokens": usage.get("cache_creation_input_tokens"),
        "cache_read_input_tokens": usage.get("cache_read_input_tokens"),
        "total_cost_usd": envelope.get("total_cost_usd"),
        "num_turns": envelope.get("num_turns"),
        # The resolved model IDs the session actually used (vs. the requested alias).
        "models": sorted(model_usage.keys()) if isinstance(model_usage, dict) else None,
    }


def _extract_text(envelope: dict) -> tuple[str, str | None]:
    """Pull the final assistant text out of the result envelope.

    Returns (text, error). On an error result, error is set; text falls back to whatever the
    envelope carries so the caller can still surface *something*.
    """
    result = envelope.get("result")
    if envelope.get("is_error") or envelope.get("subtype") not in (None, "success"):
        return (
            str(result or ""),
            f"claude error result: {envelope.get('subtype') or 'unknown'}",
        )
    if isinstance(result, str):
        return result, None
    return "", "claude result envelope had no text"
