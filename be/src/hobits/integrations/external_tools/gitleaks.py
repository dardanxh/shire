"""Adapter for `gitleaks` — secret scanning (counts + redacted locations, never the secret)."""

from __future__ import annotations

import tempfile
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from hobits.integrations.external_tools.base import ExternalTool, ToolSpec


@dataclass(frozen=True)
class SecretHit:
    rule: str
    file: str
    line: int


@dataclass(frozen=True)
class GitleaksResult:
    hits: list[SecretHit] = field(default_factory=list)
    count: int = 0
    by_rule: dict[str, int] = field(default_factory=dict)


class GitleaksAdapter(ExternalTool):
    spec = ToolSpec(
        name="gitleaks",
        purpose="Detects committed secrets/credentials (reports rule + location, not the value).",
        homepage="https://github.com/gitleaks/gitleaks",
        install="brew install gitleaks",
        category="security",
        version_args=("version",),
    )

    def run(self, clone_path: Path) -> GitleaksResult | None:
        with tempfile.NamedTemporaryFile(suffix=".json", delete=True) as report:
            proc = self._run(
                [
                    "gitleaks",
                    "dir",
                    str(clone_path),
                    "--report-format",
                    "json",
                    "--report-path",
                    report.name,
                    "--no-banner",
                ],
                timeout=180,
            )
            if proc is None:
                return None
            report.seek(0)
            data = self._parse_json(Path(report.name).read_text(encoding="utf-8", errors="ignore"))

        if not isinstance(data, list):
            return GitleaksResult()  # ran clean → no findings
        hits = [
            SecretHit(
                rule=item.get("RuleID", "?"),
                file=_relative(item.get("File", ""), clone_path),
                line=int(item.get("StartLine", 0) or 0),
            )
            for item in data
        ]
        return GitleaksResult(
            hits=hits,
            count=len(hits),
            by_rule=dict(Counter(h.rule for h in hits)),
        )


def _relative(path: str, root: Path) -> str:
    try:
        return str(Path(path).relative_to(root))
    except (ValueError, OSError):
        return path
