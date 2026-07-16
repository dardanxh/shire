"""Thin wrapper around the Claude Code CLI (`claude -p`) — the hobit engine.

A hobit run shells out to `claude -p ... --output-format json` in a target directory (a repo clone),
lets the agent reason with read-only tools, and returns the final assistant text. This is the seam
the docs call the `ClaudeAgent`: the primary engine is the CLI on the Max subscription ($0); the
Claude Agent SDK can drop in behind the same `run()` interface later.

Design notes:
- **Never raises for expected failures** (missing binary, timeout, non-zero exit, unparseable
  output). Those come back as `AgentRun(ok=False, error=...)` so the hobit service can persist a
  clean run status instead of 500-ing.
- **Read-only by construction.** We pass an allow-list of read tools and leave permission mode at
  `default`; in `--print` mode any non-allowed tool (Write/Edit/Bash) is auto-denied (it can't
  prompt), so a run can't mutate the clone.
- **Auth.** By default `ANTHROPIC_API_KEY` is stripped from run envs so the CLI uses the
  logged-in session; constructing with `use_api_key=True` (env `SHIRE_USE_API_KEY`) passes the
  key through for paid API-key auth. `CLAUDE_CODE_OAUTH_TOKEN` always passes through.
"""

from __future__ import annotations

import json
import os
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

# Read-only tools a hobit may use while exploring a clone. Anything else is auto-denied in -p mode.
DEFAULT_ALLOWED_TOOLS: tuple[str, ...] = ("Read", "Grep", "Glob")


@dataclass(frozen=True)
class AgentRun:
    """The outcome of one `claude -p` invocation."""

    ok: bool  # process exited 0, was not an error result, and produced text
    text: str  # the assistant's final message (the CLI envelope's `result`)
    raw_stdout: str  # full stdout (the JSON envelope) for debugging
    error: str | None  # failure summary (stderr / timeout / non-zero / error subtype)
    exit_code: int | None  # None on timeout / spawn failure
    duration_seconds: float


class ClaudeAgent:
    """Runs `claude -p` headlessly. Constructed with engine defaults; `run()` per invocation."""

    def __init__(
        self,
        *,
        binary: str = "claude",
        model: str | None = None,
        allowed_tools: tuple[str, ...] = DEFAULT_ALLOWED_TOOLS,
        mcp_config: str | None = None,
        timeout_seconds: float = 180.0,
        use_api_key: bool = False,
    ) -> None:
        self._binary = binary
        self._model = model
        self._allowed_tools = allowed_tools
        self._mcp_config = mcp_config  # inline JSON string; omitted for the first hobit
        self._timeout_seconds = timeout_seconds
        self._use_api_key = use_api_key

    def available(self) -> bool:
        """True when the CLI is installed and answers `--version` quickly."""
        return self.version() is not None

    def version(self) -> str | None:
        """The CLI's version line (e.g. "2.1.0 (Claude Code)"), or None when not installed."""
        try:
            proc = subprocess.run(
                [self._binary, "--version"],
                capture_output=True,
                text=True,
                timeout=5,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            return None
        if proc.returncode != 0:
            return None
        return (proc.stdout or "").strip().splitlines()[0] if proc.stdout.strip() else ""

    def run(self, prompt: str, *, system: str | None = None, cwd: str | Path) -> AgentRun:
        """Invoke `claude -p` in `cwd`. Returns an AgentRun; never raises for expected failures."""
        argv = self._build_argv(prompt, system=system)
        started = time.monotonic()
        try:
            proc = subprocess.run(
                argv,
                cwd=str(cwd),
                capture_output=True,
                text=True,
                timeout=self._timeout_seconds,
                env=_claude_env(use_api_key=self._use_api_key),
            )
        except subprocess.TimeoutExpired:
            return AgentRun(
                ok=False,
                text="",
                raw_stdout="",
                error=f"claude run timed out after {self._timeout_seconds:.0f}s",
                exit_code=None,
                duration_seconds=time.monotonic() - started,
            )
        except (FileNotFoundError, OSError) as exc:
            return AgentRun(
                ok=False,
                text="",
                raw_stdout="",
                error=f"could not launch '{self._binary}': {exc}",
                exit_code=None,
                duration_seconds=time.monotonic() - started,
            )

        duration = time.monotonic() - started
        if proc.returncode != 0:
            detail = (proc.stderr or proc.stdout or "").strip()[:2000]
            return AgentRun(
                ok=False,
                text="",
                raw_stdout=proc.stdout,
                error=f"claude exited {proc.returncode}: {detail}",
                exit_code=proc.returncode,
                duration_seconds=duration,
            )

        text, err = _extract_text(proc.stdout)
        return AgentRun(
            ok=err is None,
            text=text,
            raw_stdout=proc.stdout,
            error=err,
            exit_code=proc.returncode,
            duration_seconds=duration,
        )

    def _build_argv(self, prompt: str, *, system: str | None) -> list[str]:
        argv = [self._binary, "-p", prompt, "--output-format", "json"]
        if self._model:
            argv += ["--model", self._model]
        if system:
            argv += ["--append-system-prompt", system]
        if self._mcp_config:
            argv += ["--mcp-config", self._mcp_config, "--strict-mcp-config"]
        if self._allowed_tools:
            argv += ["--allowedTools", *self._allowed_tools]
        # In --print mode, `default` auto-denies non-allowed tools instead of prompting (which would
        # hang headlessly) — so the allow-list above is the actual permission boundary.
        argv += ["--permission-mode", "default"]
        return argv


def _claude_env(*, use_api_key: bool) -> dict[str, str]:
    """Env for the run. Unless API-key auth is opted into, `ANTHROPIC_API_KEY` is stripped so
    the CLI uses the logged-in session rather than silently switching to paid API-key auth."""
    if use_api_key:
        return dict(os.environ)
    return {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}


def _extract_text(raw_stdout: str) -> tuple[str, str | None]:
    """Pull the final assistant text out of the `--output-format json` envelope.

    Returns (text, error). On an error result or unparseable envelope, error is set; text falls back
    to the raw stdout so the caller can still surface *something*.
    """
    raw = raw_stdout.strip()
    if not raw:
        return "", "claude produced no output"
    try:
        envelope = json.loads(raw)
    except json.JSONDecodeError:
        # Not the expected JSON envelope — treat the whole stdout as the text.
        return raw, None
    if isinstance(envelope, dict):
        if envelope.get("is_error") or envelope.get("subtype") not in (None, "success"):
            return (
                str(envelope.get("result") or raw),
                f"claude error result: {envelope.get('subtype') or 'unknown'}",
            )
        result = envelope.get("result")
        if isinstance(result, str):
            return result, None
    return raw, None
