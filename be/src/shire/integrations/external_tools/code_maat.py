"""Adapter for `code-maat` — temporal (change) coupling mined from git history.

Data-producing (not an artifact): it answers "which files keep changing together?" — hidden
architectural entanglement that a static dependency graph can't see. We generate a git log in
code-maat's format, run the coupling analysis, and parse the CSV into ranked pairs.

code-maat is a JVM (Clojure) uberjar. Install (one-time)::

    curl -sL -o ~/.local/share/code-maat/code-maat.jar \\
      https://github.com/adamtornhill/code-maat/releases/download/v1.0.4/code-maat-1.0.4-standalone.jar

The jar is resolved from $SHIRE_CODE_MAAT_JAR or ~/.local/share/code-maat/*.jar; needs `java`.
"""

from __future__ import annotations

import csv
import io
import os
import shutil
from pathlib import Path

from shire.integrations.external_tools.base import ExternalTool, ToolSpec

# git log flags that produce the input code-maat's `git2` parser expects.
_GIT_LOG_ARGS = (
    "log",
    "--all",
    "--numstat",
    "--date=short",
    "--pretty=format:--%h--%ad--%aN",
    "--no-renames",
)


def _resolve_jar() -> str | None:
    override = os.environ.get("SHIRE_CODE_MAAT_JAR")
    if override and Path(override).is_file():
        return override
    jars = sorted((Path.home() / ".local/share/code-maat").glob("*.jar"))
    return str(jars[-1]) if jars else None


class CodeMaatAdapter(ExternalTool):
    spec = ToolSpec(
        name="code-maat",
        purpose="Temporal (change) coupling from git history — files that change together.",
        homepage="https://github.com/adamtornhill/code-maat",
        install=(
            "download code-maat-1.0.4-standalone.jar into ~/.local/share/code-maat/ (needs java)"
        ),
        id="code-maat",
        category="history",
        kind="data",
    )

    def is_available(self) -> bool:
        return shutil.which("java") is not None and _resolve_jar() is not None

    def version(self) -> str | None:
        jar = _resolve_jar()
        if jar is None or shutil.which("java") is None:
            return None
        # Encode the jar version from its filename, e.g. code-maat-1.0.4-standalone.jar.
        name = Path(jar).stem
        return name.replace("-standalone", "")

    def run(
        self, clone_path: Path, out_dir: Path, analysis: str = "coupling", limit: int = 300
    ) -> list[dict[str, object]] | None:
        """Run a code-maat analysis. Returns parsed rows (capped) or None on failure."""
        jar = _resolve_jar()
        if jar is None or shutil.which("java") is None:
            return None
        out_dir.mkdir(parents=True, exist_ok=True)

        log_proc = self._run(["git", "-C", str(clone_path), *_GIT_LOG_ARGS], timeout=300)
        if log_proc is None or log_proc.returncode != 0 or not log_proc.stdout:
            return None
        log_file = out_dir / "git.log"
        log_file.write_text(log_proc.stdout)

        proc = self._run(
            ["java", "-jar", jar, "-l", str(log_file), "-c", "git2", "-a", analysis],
            timeout=300,
        )
        if proc is None or proc.returncode != 0 or not proc.stdout:
            return None
        return _parse_csv(proc.stdout, limit)


def _parse_csv(text: str, limit: int) -> list[dict[str, object]]:
    reader = csv.DictReader(io.StringIO(text))
    rows: list[dict[str, object]] = []
    for row in reader:
        try:
            rows.append(
                {
                    "entity": row["entity"],
                    "coupled": row["coupled"],
                    "degree": float(row["degree"]),
                    "average_revs": float(row["average-revs"]),
                }
            )
        except (KeyError, ValueError, TypeError):
            continue
    rows.sort(key=lambda r: r["degree"], reverse=True)
    return rows[:limit]
