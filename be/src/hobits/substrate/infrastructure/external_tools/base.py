"""Base for external CLI tool adapters.

Every binary we shell out to lives here behind an adapter that (a) declares its install metadata
(so docs + a setup script can be generated from code) and (b) degrades gracefully when the binary
is absent — a missing tool simply contributes nothing, the app still runs.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ToolSpec:
    name: str  # the binary name on PATH
    purpose: str
    homepage: str
    install: str  # install hint (macOS/brew-first)
    version_args: tuple[str, ...] = ("--version",)


@dataclass(frozen=True)
class ToolStatus:
    name: str
    available: bool
    version: str | None
    purpose: str
    install: str
    homepage: str


class ExternalTool:
    """Base adapter. Subclasses set `spec` and implement a `run(...)` method."""

    spec: ToolSpec

    def is_available(self) -> bool:
        return shutil.which(self.spec.name) is not None

    def version(self) -> str | None:
        if not self.is_available():
            return None
        try:
            result = subprocess.run(
                [self.spec.name, *self.spec.version_args],
                capture_output=True,
                text=True,
                timeout=15,
            )
        except (OSError, subprocess.SubprocessError):
            return None
        output = (result.stdout or result.stderr).strip()
        return output.splitlines()[0] if output else None

    def status(self) -> ToolStatus:
        return ToolStatus(
            name=self.spec.name,
            available=self.is_available(),
            version=self.version(),
            purpose=self.spec.purpose,
            install=self.spec.install,
            homepage=self.spec.homepage,
        )

    def _run(
        self, args: list[str], timeout: int = 300, env: dict[str, str] | None = None
    ) -> subprocess.CompletedProcess[str] | None:
        """Run the binary. Returns the completed process (any exit code) or None on hard failure."""
        if not self.is_available():
            return None
        try:
            return subprocess.run(args, capture_output=True, text=True, timeout=timeout, env=env)
        except (OSError, subprocess.SubprocessError):
            return None

    @staticmethod
    def _parse_json(text: str | None) -> Any | None:
        if not text:
            return None
        try:
            return json.loads(text)
        except (json.JSONDecodeError, ValueError):
            return None
