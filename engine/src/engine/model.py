"""The engine seam: a generic prompt-in / text-out execution interface.

The worker builds an `EngineRequest` from a claimed job's payload and hands it to whichever
`Engine` implementation is configured. Replacing Claude with another LLM engine means shipping a
new `Engine` implementation — the queue, the worker loop, and the backend never change.
"""

from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel


class EngineRequest(BaseModel):
    prompt: str
    system: str | None = None
    cwd: str
    allowed_tools: tuple[str, ...] = ("Read", "Grep", "Glob")
    model: str | None = None
    timeout_seconds: float = 500.0


class EngineResult(BaseModel):
    ok: bool
    text: str  # the engine's final answer (empty on failure)
    error: str | None = None
    duration_seconds: float = 0.0


class Engine(Protocol):
    def available(self) -> bool: ...

    def run(self, request: EngineRequest) -> EngineResult: ...
