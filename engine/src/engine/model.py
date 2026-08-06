"""The engine seam: a generic prompt-in / text-out execution interface.

The worker builds an `EngineRequest` from a claimed job's payload and hands it to whichever
`Engine` implementation is configured. Replacing Claude with another LLM engine means shipping a
new `Engine` implementation — the queue, the worker loop, and the backend never change.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Protocol

from pydantic import BaseModel


class EngineRequest(BaseModel):
    prompt: str
    system: str | None = None
    cwd: str
    allowed_tools: tuple[str, ...] = ("Read", "Grep", "Glob")
    # Tools to deny outright. Deny beats allow, so this is the only way to express "no tools":
    # an *empty* `allowed_tools` omits the --allowedTools flag, which the CLI reads as
    # unrestricted rather than as sandboxed.
    disallowed_tools: tuple[str, ...] = ()
    model: str | None = None
    timeout_seconds: float = 500.0


class EngineResult(BaseModel):
    ok: bool
    text: str  # the engine's final answer (empty on failure)
    error: str | None = None
    duration_seconds: float = 0.0
    # Session-cumulative token accounting as reported by the engine (input_tokens,
    # output_tokens, cache_*_input_tokens, total_cost_usd, num_turns). None when the
    # engine died before producing an envelope.
    usage: dict | None = None


class Engine(Protocol):
    def available(self) -> bool: ...

    def version(self) -> str | None:
        """The engine's version line (e.g. "2.1.0 (Claude Code)"), or None when unavailable."""
        ...

    def run(
        self,
        request: EngineRequest,
        on_event: Callable[[dict], None] | None = None,
    ) -> EngineResult:
        """Execute the request. `on_event` (optional) receives compact transcript events as
        the agent works — {"type": "text"|"tool"|"tool_result", ...} — for live progress UIs.
        Implementations without streaming may simply never call it."""
        ...
