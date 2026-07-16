"""Adapter for `ruff` — fast Python linter; counts lint violations across the codebase."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from shire.integrations.external_tools.base import ExternalTool, ToolSpec


@dataclass(frozen=True)
class RuffResult:
    issue_count: int = 0
    by_rule: dict[str, int] = field(default_factory=dict)
    findings: list[str] = field(default_factory=list)


class RuffAdapter(ExternalTool):
    spec = ToolSpec(
        name="ruff",
        purpose="Fast Python linter — counts lint violations (respecting the repo's own config).",
        homepage="https://github.com/astral-sh/ruff",
        install="bundled (uv sync)",
        category="metrics",
        language="python",
    )

    def run(self, clone_path: Path) -> RuffResult | None:
        # `--output-format json` emits a JSON array of diagnostics; `--exit-zero` keeps the exit
        # code 0 even when issues are found so we never mistake "found lint" for a hard failure.
        proc = self._run(
            ["ruff", "check", "--output-format", "json", "--exit-zero", str(clone_path)],
            timeout=180,
        )
        if proc is None:
            return None
        data = self._parse_json(proc.stdout)
        if not isinstance(data, list):
            return None
        root = str(clone_path.resolve())
        by_rule: dict[str, int] = {}
        findings: list[str] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            code = item.get("code") or "?"
            by_rule[code] = by_rule.get(code, 0) + 1
            path = item.get("filename", "")
            if path.startswith(root):
                path = path[len(root) :].lstrip("/")
            loc = item.get("location") or {}
            findings.append(
                f"{path}:{loc.get('row', '?')}:{loc.get('column', '?')}: "
                f"{code} {item.get('message', '')}"
            )
        return RuffResult(issue_count=len(data), by_rule=by_rule, findings=findings)
