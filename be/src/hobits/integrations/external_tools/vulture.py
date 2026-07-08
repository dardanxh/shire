"""Adapter for `vulture` — finds unused (dead) Python code."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from hobits.integrations.external_tools.base import ExternalTool, ToolSpec


@dataclass(frozen=True)
class VultureResult:
    dead_code_count: int = 0
    findings: list[str] = field(default_factory=list)


class VultureAdapter(ExternalTool):
    spec = ToolSpec(
        name="vulture",
        purpose="Finds unused (dead) Python code — unused functions, classes, variables, imports.",
        homepage="https://github.com/jendrikseipp/vulture",
        install="bundled (uv sync)",
        category="metrics",
        language="python",
    )

    def run(self, clone_path: Path) -> VultureResult | None:
        # vulture has no JSON output: it prints one finding per line on stdout. Exit codes:
        # 0 = clean, 3 = dead code found (v2.x), 1 = dead code found (legacy) or bad input.
        # 2 = invalid CLI args → treat as failure. Count non-empty stdout lines as findings.
        proc = self._run(
            ["vulture", "--min-confidence", "80", str(clone_path)],
            timeout=180,
        )
        if proc is None or proc.returncode not in (0, 1, 3):
            return None
        root = str(clone_path.resolve())
        findings = [
            (line[len(root) :].lstrip("/") if line.startswith(root) else line)
            for line in proc.stdout.splitlines()
            if line.strip()
        ]
        return VultureResult(dead_code_count=len(findings), findings=findings)
