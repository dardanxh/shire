"""Adapter for `scc` — fast, comment-aware LOC + complexity + COCOMO cost estimate."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from hobits.substrate.infrastructure.external_tools.base import ExternalTool, ToolSpec


@dataclass(frozen=True)
class SccLanguage:
    name: str
    code: int
    comment: int
    blank: int
    complexity: int
    files: int


@dataclass(frozen=True)
class SccResult:
    languages: list[SccLanguage] = field(default_factory=list)
    total_code: int = 0
    total_complexity: int = 0
    cocomo_cost_usd: float = 0.0
    schedule_months: float = 0.0
    people: float = 0.0


class SccAdapter(ExternalTool):
    spec = ToolSpec(
        name="scc",
        purpose="Comment-aware LOC by language + cyclomatic complexity + COCOMO cost estimate.",
        homepage="https://github.com/boyter/scc",
        install="brew install scc",
    )

    def run(self, clone_path: Path) -> SccResult | None:
        proc = self._run(["scc", "--format", "json2", str(clone_path)], timeout=180)
        if proc is None or proc.returncode != 0:
            return None
        data = self._parse_json(proc.stdout)
        if not isinstance(data, dict):
            return None

        languages = [
            SccLanguage(
                name=item.get("Name", "?"),
                code=item.get("Code", 0),
                comment=item.get("Comment", 0),
                blank=item.get("Blank", 0),
                complexity=item.get("Complexity", 0),
                files=item.get("Count", 0),
            )
            for item in data.get("languageSummary", [])
        ]
        return SccResult(
            languages=languages,
            total_code=sum(lang.code for lang in languages),
            total_complexity=sum(lang.complexity for lang in languages),
            cocomo_cost_usd=float(data.get("estimatedCost", 0.0) or 0.0),
            schedule_months=float(data.get("estimatedScheduleMonths", 0.0) or 0.0),
            people=float(data.get("estimatedPeople", 0.0) or 0.0),
        )
