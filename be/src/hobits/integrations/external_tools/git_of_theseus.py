"""Adapter for `git-of-theseus` — how a repo's code survives/ages over time.

Artifact-producing (like emerge): it walks git history and emits a stacked-area SVG showing how many
lines from each year's "cohort" still exist today — a quick read on whether a codebase is churning
fresh or sitting on a fossil layer. We serve the SVG and a small per-cohort breakdown.

Install (uv tool, lands in ~/.local/bin — resolved directly below since that's often off PATH)::

    uv tool install git-of-theseus
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from hobits.integrations.external_tools.base import ExternalTool, ToolSpec


def _resolve(name: str) -> str | None:
    """Resolve a console script: PATH first, then the uv-tool bin dir."""
    found = shutil.which(name)
    if found:
        return found
    candidate = Path.home() / ".local/bin" / name
    return str(candidate) if candidate.is_file() else None


class GitOfTheseusAdapter(ExternalTool):
    spec = ToolSpec(
        name="git-of-theseus-analyze",
        purpose="Code age / survival over time (stacked-area chart of per-year cohorts).",
        homepage="https://github.com/erikbern/git-of-theseus",
        install="uv tool install git-of-theseus",
        id="git-of-theseus",
        category="history",
        kind="artifact",
    )

    STACK_PLOT = "git-of-theseus-stack-plot"
    SVG_NAME = "stack.svg"

    def is_available(self) -> bool:
        return _resolve(self.spec.name) is not None and _resolve(self.STACK_PLOT) is not None

    def version(self) -> str | None:
        # git-of-theseus has no version flag; report a stable label when present.
        return "installed" if self.is_available() else None

    def run(self, source_dir: Path, out_dir: Path, branch: str | None) -> Path | None:
        """Analyze history and render the cohort stack plot. Returns the SVG path or None."""
        analyze = _resolve(self.spec.name)
        stack_plot = _resolve(self.STACK_PLOT)
        if analyze is None or stack_plot is None:
            return None
        out_dir.mkdir(parents=True, exist_ok=True)

        analyze_args = [analyze, str(source_dir), "--outdir", str(out_dir)]
        analyze_args += ["--quiet", "--procs", "4"]
        if branch:
            analyze_args += ["--branch", branch]
        if self._run(analyze_args, timeout=600) is None:
            return None

        cohorts = out_dir / "cohorts.json"
        if not cohorts.is_file():
            return None

        svg = out_dir / self.SVG_NAME
        if self._run([stack_plot, str(cohorts), "--outfile", str(svg)], timeout=120) is None:
            return None
        return svg if svg.is_file() else None

    @staticmethod
    def read_cohorts(out_dir: Path) -> list[dict[str, object]]:
        """Surviving lines per year-cohort as of the latest commit. Empty on miss."""
        try:
            data = json.loads((out_dir / "cohorts.json").read_text())
            labels = data["labels"]
            series = data["y"]  # series[cohort] is a time series; last point = "now"
            return [
                {"label": labels[i], "lines": int(series[i][-1])}
                for i in range(len(labels))
                if series[i] and series[i][-1]
            ]
        except (OSError, json.JSONDecodeError, ValueError, KeyError, IndexError, TypeError):
            return []
