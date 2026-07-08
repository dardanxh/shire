"""Adapter for `emerge` — interactive codebase & dependency-graph visualization.

Unlike the other adapters (scc, syft, …) emerge does not contribute scalar metrics to the
analysis. It produces an *artifact*: a self-contained D3/Bootstrap web app (``html/emerge.html``
plus relative ``vendors/`` + ``resources/``) that the UI iframes. So this adapter runs emerge
against a source tree and returns the path to the generated ``html`` directory; serving is handled
by a static mount, not the enrichment/ratings pipeline.

Install note: emerge is a stale (2024) package with several dependency-drift issues on modern
Pythons. It imports ``pkg_resources``/``pip`` internals (gone/relocated on 3.13), and it exports
its graph via ``networkx.node_link_data`` — whose default edge key flipped from ``links`` to
``edges`` in networkx 3.4, which silently breaks emerge's JS graph renderer (blank canvas). Pin
all three::

    uv tool install emerge-viz --with 'setuptools<81' --with pip --with 'networkx<3.4'

emerge also has no ``--version`` flag (``-v`` means verbose); we parse the banner instead.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from hobits.integrations.external_tools.base import ExternalTool, ToolSpec

# emerge is installed as a uv tool, which lands in ~/.local/bin — not always on the server
# process's PATH (e.g. under `uv run uvicorn ...`). Probe these fallbacks so the feature works
# without requiring the operator to fix PATH.
_FALLBACK_BINARIES: tuple[Path, ...] = (
    Path.home() / ".local/bin/emerge",
    Path.home() / ".local/share/uv/tools/emerge-viz/bin/emerge",
)

# emerge language id -> file extensions it should scan. One analysis permits all of them, so a
# polyglot repo yields a single combined graph (per-language import clusters).
_LANGUAGES: dict[str, tuple[str, ...]] = {
    "py": (".py",),
    "typescript": (".ts", ".tsx"),
    "javascript": (".js", ".jsx"),
    "java": (".java",),
    "kotlin": (".kt",),
    "go": (".go",),
    "swift": (".swift",),
    "ruby": (".rb",),
    "groovy": (".groovy",),
    "c": (".c", ".h"),
    "cpp": (".cpp", ".hpp"),
    "objc": (".m",),
}

# Directory names pruned from the scan (exact-name match, as emerge walks). A freshly cloned repo is
# usually pristine, but this defends against repos that vendor dependencies or ship build output.
_IGNORE_DIRS: tuple[str, ...] = (
    "node_modules",
    ".venv",
    "venv",
    "env",
    "__pycache__",
    ".git",
    "dist",
    "build",
    "out",
    "target",
    "vendor",
    "site-packages",
    ".next",
    ".nuxt",
    ".tox",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".gradle",
    ".idea",
    ".vscode",
    "coverage",
    ".data",
)

# Per-file metrics. Beyond the dependency graph these give the "weight" signal (SLOC, method count,
# fan-in/out) and Louvain community detection that groups related modules in the visualization.
_FILE_SCAN: tuple[str, ...] = (
    "number_of_methods",
    "source_lines_of_code",
    "dependency_graph",
    "louvain_modularity",
    "fan_in_out",
)


def _yaml_block_list(items: tuple[str, ...] | list[str], indent: int) -> str:
    pad = " " * indent
    return "".join(f"{pad}- {item}\n" for item in items)


class EmergeAdapter(ExternalTool):
    spec = ToolSpec(
        name="emerge",
        purpose="Interactive codebase + dependency-graph visualization (D3 web app).",
        homepage="https://github.com/glato/emerge",
        install=(
            "uv tool install emerge-viz --with 'setuptools<81' --with pip --with 'networkx<3.4'"
        ),
        id="emerge",
        category="visualization",
        kind="artifact",
    )

    # emerge has no --version flag; version() below parses the banner instead.
    HTML_ENTRY = "html/emerge.html"

    def _binary(self) -> str | None:
        """Resolve the emerge executable: PATH first, then known uv-tool fallbacks."""
        found = shutil.which(self.spec.name)
        if found:
            return found
        return next((str(p) for p in _FALLBACK_BINARIES if p.is_file()), None)

    def is_available(self) -> bool:
        return self._binary() is not None

    def version(self) -> str | None:
        binary = self._binary()
        if binary is None:
            return None
        proc = self._run([binary, "-h"], timeout=15)
        if proc is None:
            return None
        # Banner line looks like: "🔎 Welcome to emerge 2.0.7" — return from the "emerge" token on.
        for line in (proc.stdout or "").splitlines():
            lowered = line.lower()
            if "emerge" in lowered and any(ch.isdigit() for ch in line):
                return line[lowered.index("emerge") :].strip()
        return None

    def _build_config(self, source_dir: Path, out_dir: Path, project_name: str) -> str:
        extensions = sorted({ext for exts in _LANGUAGES.values() for ext in exts})
        return (
            "---\n"
            f"project_name: {project_name}\n"
            "loglevel: error\n"
            "analyses:\n"
            f"- analysis_name: {project_name}\n"
            f"  source_directory: {source_dir}\n"
            "  only_permit_languages:\n"
            f"{_yaml_block_list(list(_LANGUAGES), 2)}"
            "  only_permit_file_extensions:\n"
            f"{_yaml_block_list(extensions, 2)}"
            "  ignore_directories_containing:\n"
            f"{_yaml_block_list(_IGNORE_DIRS, 2)}"
            "  file_scan:\n"
            f"{_yaml_block_list(_FILE_SCAN, 2)}"
            "  export:\n"
            f"  - directory: {out_dir}\n"
            "  - json\n"
            "  - d3\n"
        )

    def run(self, source_dir: Path, out_dir: Path, project_name: str) -> Path | None:
        """Generate the graph for ``source_dir`` into ``out_dir``.

        Returns the path to the generated ``html`` directory (containing ``emerge.html`` +
        relative assets), or None if emerge is unavailable or produced no output.
        """
        binary = self._binary()
        if binary is None:
            return None
        out_dir.mkdir(parents=True, exist_ok=True)
        config_path = out_dir / "emerge-config.yaml"
        config_path.write_text(self._build_config(source_dir, out_dir, project_name))

        proc = self._run([binary, "-c", str(config_path)], timeout=600)
        if proc is None:
            return None

        html_dir = out_dir / "html"
        if not (html_dir / "emerge.html").is_file():
            return None
        return html_dir

    @staticmethod
    def read_stats(out_dir: Path) -> dict[str, int]:
        """Best-effort scan stats (scanned files, graph node count) for display. Empty on miss."""
        stats: dict[str, int] = {}
        metrics_file = out_dir / "emerge-statistics-and-metrics.json"
        try:
            data = json.loads(metrics_file.read_text())
            scanned = data.get("statistics", {}).get("scanned_files")
            if isinstance(scanned, int):
                stats["scanned_files"] = scanned
        except (OSError, json.JSONDecodeError, ValueError, AttributeError):
            pass
        graph_file = out_dir / "emerge-file_result_dependency_graph-data.json"
        try:
            data = json.loads(graph_file.read_text())
            nodes = data.get("nodes")
            if isinstance(nodes, list):
                stats["node_count"] = len(nodes)
        except (OSError, json.JSONDecodeError, ValueError, AttributeError):
            pass
        return stats
