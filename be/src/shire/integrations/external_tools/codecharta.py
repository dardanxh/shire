"""Adapter for `CodeCharta` — the 3D "code city" map (files as buildings).

Artifact-producing: `ccsh unifiedparser` computes per-file metrics (real lines, complexity, …) and
emits a `.cc.json` map. CodeCharta ships a static browser viewer that loads a map via a `?file=`
URL param; we serve both same-origin and iframe the viewer. This spatial map answers "where is the
weight/risk concentrated?" — complementary to emerge's structural dependency graph.

Install (two npm packages — the analyzer CLI and the viewer we mount)::

    npm install -g codecharta-analysis codecharta-visualization

`ccsh` is resolved on PATH; the viewer dir from $SHIRE_CODECHARTA_VIEWER or the npm global root.
"""

from __future__ import annotations

import gzip
import json
import os
from pathlib import Path

from shire.integrations.external_tools.base import ExternalTool, ToolSpec

# Candidate npm global roots that hold codecharta-visualization/dist/bundler/browser.
_NPM_GLOBAL_ROOTS = (
    "/opt/homebrew/lib/node_modules",
    "/usr/local/lib/node_modules",
    "/usr/lib/node_modules",
    str(Path.home() / ".npm-global/lib/node_modules"),
)
_VIEWER_SUBPATH = "codecharta-visualization/dist/bundler/browser"


def resolve_viewer_dir() -> Path | None:
    """Locate the CodeCharta browser viewer (a static SPA) to mount, or None if absent."""
    override = os.environ.get("SHIRE_CODECHARTA_VIEWER")
    if override and (Path(override) / "index.html").is_file():
        return Path(override)
    for root in _NPM_GLOBAL_ROOTS:
        candidate = Path(root) / _VIEWER_SUBPATH
        if (candidate / "index.html").is_file():
            return candidate
    return None


class CodeChartaAdapter(ExternalTool):
    spec = ToolSpec(
        name="ccsh",
        purpose="3D code-city map — files as buildings sized/colored by metrics (LOC, complexity).",
        homepage="https://github.com/MaibornWolff/codecharta",
        install="npm install -g codecharta-analysis codecharta-visualization",
        id="codecharta",
        category="visualization",
        kind="artifact",
    )

    MAP_NAME = "map.cc.json"

    def version(self) -> str | None:
        if not self.is_available():
            return None
        proc = self._run(["ccsh", "--version"], timeout=15)
        if proc is None:
            return None
        for line in (proc.stdout or "").splitlines():
            if any(ch.isdigit() for ch in line):
                return line.strip().strip('"')
        return None

    def viewer_available(self) -> bool:
        return resolve_viewer_dir() is not None

    def run(self, source_dir: Path, out_dir: Path) -> Path | None:
        """Generate the `.cc.json` map (uncompressed). Returns the map path or None."""
        if not self.is_available():
            return None
        out_dir.mkdir(parents=True, exist_ok=True)
        target = out_dir / self.MAP_NAME

        proc = self._run(["ccsh", "unifiedparser", str(source_dir), "-o", str(target)], timeout=600)
        if proc is None:
            return None

        # ccsh gzips its output by default (`map.cc.json.gz`). Decompress so the viewer fetch and
        # our static serving don't fight over Content-Encoding.
        gz = Path(f"{target}.gz")
        if gz.is_file():
            target.write_bytes(gzip.decompress(gz.read_bytes()))
            gz.unlink()
        return target if target.is_file() else None

    @staticmethod
    def file_count(map_path: Path) -> int | None:
        """Count File leaves in a cc.json map. None on miss."""
        try:
            data = json.loads(map_path.read_text())
            nodes = data.get("data", data).get("nodes", [])

            def count(node: dict) -> int:
                if node.get("type") == "File":
                    return 1
                return sum(count(child) for child in node.get("children", []))

            return sum(count(n) for n in nodes)
        except (OSError, json.JSONDecodeError, ValueError, AttributeError, TypeError):
            return None
