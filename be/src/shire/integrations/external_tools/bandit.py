"""Adapter for `bandit` — Python security linter (SAST); issue count by severity."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from shire.integrations.external_tools.base import ExternalTool, ToolSpec


@dataclass(frozen=True)
class BanditResult:
    issue_count: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    findings: list[str] = field(default_factory=list)


class BanditAdapter(ExternalTool):
    spec = ToolSpec(
        name="bandit",
        purpose="Python security linter (SAST) — flags common security issues, bucketed by severity.",
        homepage="https://github.com/PyCQA/bandit",
        install="bundled (uv sync)",
        category="security",
        language="python",
    )

    def run(self, clone_path: Path) -> BanditResult | None:
        # `-r -f json -q` scans recursively and emits `{"results": [...], "metrics": {...}}`.
        # Exit code is non-zero when issues are found, so we tolerate any exit and parse stdout.
        proc = self._run(
            ["bandit", "-r", "-f", "json", "-q", str(clone_path)],
            timeout=300,
        )
        if proc is None:
            return None
        data = self._parse_json(proc.stdout)
        if not isinstance(data, dict):
            return None
        results = data.get("results", [])
        if not isinstance(results, list):
            return None

        def sev(level: str) -> int:
            return sum(
                1
                for r in results
                if isinstance(r, dict) and (r.get("issue_severity") or "").upper() == level
            )

        root = str(clone_path.resolve())
        findings: list[str] = []
        for r in results:
            if not isinstance(r, dict):
                continue
            path = r.get("filename", "")
            if path.startswith(root):
                path = path[len(root) :].lstrip("/")
            findings.append(
                f"[{(r.get('issue_severity') or '').upper()}] {path}:{r.get('line_number', '?')} "
                f"{r.get('test_id', '')} {r.get('issue_text', '')}"
            )

        return BanditResult(
            issue_count=len(results),
            high=sev("HIGH"),
            medium=sev("MEDIUM"),
            low=sev("LOW"),
            findings=findings,
        )
