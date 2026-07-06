"""Adapter for `syft` — SBOM generation (resolved + transitive packages, lockfile-aware)."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from hobits.substrate.infrastructure.external_tools.base import ExternalTool, ToolSpec


@dataclass(frozen=True)
class SbomPackage:
    name: str
    version: str | None
    type: str  # syft package type, e.g. "python", "npm", "go-module"


@dataclass(frozen=True)
class SyftResult:
    packages: list[SbomPackage] = field(default_factory=list)
    count: int = 0
    by_type: dict[str, int] = field(default_factory=dict)


class SyftAdapter(ExternalTool):
    spec = ToolSpec(
        name="syft",
        purpose="SBOM — resolved + transitive dependencies across ecosystems.",
        homepage="https://github.com/anchore/syft",
        install="brew install syft",
    )

    def run(self, clone_path: Path) -> SyftResult | None:
        proc = self._run(["syft", str(clone_path), "-o", "syft-json", "-q"], timeout=300)
        if proc is None or proc.returncode != 0:
            return None
        data = self._parse_json(proc.stdout)
        if not isinstance(data, dict):
            return None

        packages = [
            SbomPackage(
                name=a.get("name", "?"),
                version=a.get("version") or None,
                type=a.get("type", "unknown"),
            )
            for a in data.get("artifacts", [])
            if a.get("name")
        ]
        return SyftResult(
            packages=packages,
            count=len(packages),
            by_type=dict(Counter(p.type for p in packages)),
        )
