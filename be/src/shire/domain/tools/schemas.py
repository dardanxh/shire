"""Result schema for the tools catalog.

`from_attributes` lets us build the result straight from a `ToolRow` (read path) or an in-flight row
(sync path) via `model_validate(row)` — no hand-written mapper needed since field names line up.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ToolStatusResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    available: bool
    version: str | None
    purpose: str
    install: str
    homepage: str
    id: str
    category: str
    kind: str
    language: str
    synced_at: datetime | None = None
    # One-click install overlay (computed at read time; never persisted — the catalog sync
    # would wipe it). `installer` names the runner ("brew"/"uv"/"npm") even when it's missing,
    # so the UI can say "requires Homebrew".
    installable: bool = False
    installer: str | None = None
    install_status: str = "idle"  # idle | running | succeeded | failed
    install_error: str | None = None
