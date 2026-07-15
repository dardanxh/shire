"""Claude Code CLI engine (`claude -p`) — the default `Engine` implementation.

Ported from the backend's `ClaudeAgent` wrapper. Runs headlessly in a repo clone with read-only
tools, on the logged-in Max subscription.

Design notes:
- **Never raises for expected failures** (missing binary, timeout, non-zero exit, unparseable
  output) — those come back as `EngineResult(ok=False, error=...)` so the job settles cleanly.
- **Read-only by construction.** In `--print` mode, permission mode `default` auto-denies any
  tool outside the allow-list (it can't prompt), so a run can't mutate the clone.
- **Subscription auth.** `ANTHROPIC_API_KEY` is stripped from the env so the CLI uses the
  logged-in session rather than silently switching to paid API-key auth.
"""

from __future__ import annotations

import json
import os
import subprocess
import time

from engine.model import EngineRequest, EngineResult


class ClaudeCliEngine:
    def __init__(self, *, binary: str = "claude") -> None:
        self._binary = binary

    def available(self) -> bool:
        """True when the CLI is installed and answers `--version` quickly."""
        try:
            proc = subprocess.run(
                [self._binary, "--version"],
                capture_output=True,
                text=True,
                timeout=5,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            return False
        return proc.returncode == 0

    def run(self, request: EngineRequest) -> EngineResult:
        argv = self._build_argv(request)
        started = time.monotonic()
        try:
            proc = subprocess.run(
                argv,
                cwd=request.cwd,
                capture_output=True,
                text=True,
                timeout=request.timeout_seconds,
                env=_subscription_env(),
            )
        except subprocess.TimeoutExpired:
            return EngineResult(
                ok=False,
                text="",
                error=f"claude run timed out after {request.timeout_seconds:.0f}s",
                duration_seconds=time.monotonic() - started,
            )
        except (FileNotFoundError, NotADirectoryError, OSError) as exc:
            return EngineResult(
                ok=False,
                text="",
                error=f"could not launch '{self._binary}': {exc}",
                duration_seconds=time.monotonic() - started,
            )

        duration = time.monotonic() - started
        if proc.returncode != 0:
            detail = (proc.stderr or proc.stdout or "").strip()[:2000]
            return EngineResult(
                ok=False,
                text="",
                error=f"claude exited {proc.returncode}: {detail}",
                duration_seconds=duration,
            )

        text, err = _extract_text(proc.stdout)
        return EngineResult(ok=err is None, text=text, error=err, duration_seconds=duration)

    def _build_argv(self, request: EngineRequest) -> list[str]:
        argv = [self._binary, "-p", request.prompt, "--output-format", "json"]
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


def _subscription_env() -> dict[str, str]:
    return {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}


def _extract_text(raw_stdout: str) -> tuple[str, str | None]:
    """Pull the final assistant text out of the `--output-format json` envelope.

    Returns (text, error). On an error result or unparseable envelope, error is set; text falls
    back to the raw stdout so the caller can still surface *something*.
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
