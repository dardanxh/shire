"""Shared filesystem helpers + language mapping for scanners."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

IGNORE_DIRS = {
    ".git",
    "node_modules",
    ".venv",
    "venv",
    "env",
    "dist",
    "build",
    ".next",
    "out",
    "target",
    "vendor",
    ".idea",
    ".vscode",
    ".mypy_cache",
    ".pytest_cache",
    "__pycache__",
    ".ruff_cache",
    ".data",
    ".turbo",
    "coverage",
    ".gradle",
    ".terraform",
}

LANG_BY_EXT = {
    ".py": "Python",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".mjs": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".java": "Java",
    ".go": "Go",
    ".rs": "Rust",
    ".rb": "Ruby",
    ".php": "PHP",
    ".c": "C",
    ".h": "C Header",
    ".cpp": "C++",
    ".cc": "C++",
    ".cxx": "C++",
    ".hpp": "C++",
    ".cs": "C#",
    ".swift": "Swift",
    ".kt": "Kotlin",
    ".scala": "Scala",
    ".sh": "Shell",
    ".bash": "Shell",
    ".sql": "SQL",
    ".r": "R",
    ".m": "Objective-C",
    ".html": "HTML",
    ".css": "CSS",
    ".scss": "SCSS",
    ".vue": "Vue",
    ".dart": "Dart",
    ".ex": "Elixir",
    ".exs": "Elixir",
    ".clj": "Clojure",
    ".hs": "Haskell",
    ".lua": "Lua",
    ".pl": "Perl",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".json": "JSON",
    ".toml": "TOML",
    ".md": "Markdown",
    ".tf": "Terraform",
    ".proto": "Protobuf",
}

# Languages that shouldn't win "primary language" (data/markup/docs).
NON_CODE_LANGS = {"YAML", "JSON", "TOML", "Markdown", "HTML", "CSS", "SCSS"}

_MAX_TEXT_BYTES = 2_000_000


def walk_files(root: Path) -> Iterator[Path]:
    """Yield files under root, pruning ignored directories."""
    stack = [root]
    while stack:
        current = stack.pop()
        try:
            entries = list(current.iterdir())
        except (PermissionError, OSError):
            continue
        for entry in entries:
            if entry.is_dir():
                if entry.name not in IGNORE_DIRS:
                    stack.append(entry)
            elif entry.is_file():
                yield entry


def is_probably_binary(path: Path) -> bool:
    try:
        with path.open("rb") as fh:
            return b"\x00" in fh.read(1024)
    except OSError:
        return True


def count_loc(path: Path) -> int:
    """Non-blank line count for a text file (bounded by size)."""
    try:
        if path.stat().st_size > _MAX_TEXT_BYTES:
            return 0
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return 0
    return sum(1 for line in text.splitlines() if line.strip())
