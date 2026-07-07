"""Adapter for OpenSSF `scorecard` — repository health/security rating (0-10).

Needs network + a GitHub token, and only rates GitHub-hosted repos. Skips (returns None) when no
token is configured or the repo isn't on GitHub.
"""

from __future__ import annotations

import os
import re
import subprocess
from dataclasses import dataclass, field

from hobits.integrations.external_tools.base import ExternalTool, ToolSpec


@dataclass(frozen=True)
class HealthCheckResult:
    name: str
    score: int  # 0-10, or -1 when inconclusive
    reason: str


@dataclass(frozen=True)
class ScorecardResult:
    score: float  # aggregate 0-10 (-1 if not computed)
    checks: list[HealthCheckResult] = field(default_factory=list)


class ScorecardAdapter(ExternalTool):
    spec = ToolSpec(
        name="scorecard",
        purpose="OpenSSF project health/security rating (branch protection, CI, review, SAST...).",
        homepage="https://github.com/ossf/scorecard",
        install="brew install scorecard",
        version_args=("version",),
    )

    def version(self) -> str | None:
        # `scorecard version` prints an ASCII banner then a `GitVersion:` line.
        if not self.is_available():
            return None
        try:
            result = subprocess.run(
                ["scorecard", "version"], capture_output=True, text=True, timeout=15
            )
        except (OSError, subprocess.SubprocessError):
            return None
        for line in (result.stdout or result.stderr).splitlines():
            if "GitVersion" in line:
                return line.split(":", 1)[-1].strip()
        return None

    def run(self, repo_url: str, token: str | None) -> ScorecardResult | None:
        target = _github_target(repo_url)
        if target is None or not token:
            return None
        env = {**os.environ, "GITHUB_TOKEN": token, "GITHUB_AUTH_TOKEN": token}
        proc = self._run(
            ["scorecard", f"--repo={target}", "--format=json", "--show-details=false"],
            timeout=300,
            env=env,
        )
        if proc is None or proc.returncode != 0:
            return None
        data = self._parse_json(proc.stdout)
        if not isinstance(data, dict):
            return None
        checks = [
            HealthCheckResult(
                name=c.get("name", "?"),
                score=int(c.get("score", -1)),
                reason=c.get("reason", ""),
            )
            for c in data.get("checks", [])
        ]
        return ScorecardResult(score=float(data.get("score", -1.0)), checks=checks)


def _github_target(repo_url: str) -> str | None:
    match = re.search(r"github\.com[:/]([^/]+)/([^/]+?)(?:\.git)?/?$", repo_url)
    if not match:
        return None
    return f"github.com/{match.group(1)}/{match.group(2)}"
