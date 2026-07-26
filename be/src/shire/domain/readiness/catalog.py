"""The AI-assistant artifact catalog + the deterministic clone scan.

One entry per supported coding assistant, each with the config artifacts that make a
repository "ready" for it. The scan is pure file-presence checks on the clone — instant,
free, and always current (no job involved).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Artifact:
    key: str
    path: str
    kind: str  # file | dir
    role: str  # instructions | skills | commands | agents | settings | rules | config


@dataclass(frozen=True)
class Assistant:
    key: str
    name: str
    artifacts: tuple[Artifact, ...]


CATALOG: tuple[Assistant, ...] = (
    Assistant(
        key="claude",
        name="Claude Code",
        artifacts=(
            Artifact("claude_md", "CLAUDE.md", "file", "instructions"),
            Artifact("claude_skills", ".claude/skills", "dir", "skills"),
            Artifact("claude_commands", ".claude/commands", "dir", "commands"),
            Artifact("claude_agents", ".claude/agents", "dir", "agents"),
            Artifact("claude_settings", ".claude/settings.json", "file", "settings"),
        ),
    ),
    Assistant(
        key="codex",
        name="OpenAI Codex",
        artifacts=(
            Artifact("agents_md", "AGENTS.md", "file", "instructions"),
            Artifact("codex_config", ".codex/config.toml", "file", "config"),
        ),
    ),
    Assistant(
        key="cursor",
        name="Cursor",
        artifacts=(
            Artifact("cursor_rules", ".cursor/rules", "dir", "rules"),
            Artifact("cursorrules", ".cursorrules", "file", "rules"),
        ),
    ),
    Assistant(
        key="copilot",
        name="GitHub Copilot",
        artifacts=(
            Artifact(
                "copilot_instructions",
                ".github/copilot-instructions.md",
                "file",
                "instructions",
            ),
            Artifact("copilot_path_instructions", ".github/instructions", "dir", "rules"),
        ),
    ),
    Assistant(
        key="windsurf",
        name="Windsurf",
        artifacts=(
            Artifact("windsurf_rules", ".windsurf/rules", "dir", "rules"),
            Artifact("windsurfrules", ".windsurfrules", "file", "rules"),
        ),
    ),
    Assistant(
        key="gemini",
        name="Gemini CLI",
        artifacts=(Artifact("gemini_md", "GEMINI.md", "file", "instructions"),),
    ),
    Assistant(
        key="aider",
        name="Aider",
        artifacts=(
            Artifact("aider_conf", ".aider.conf.yml", "file", "config"),
            Artifact("conventions_md", "CONVENTIONS.md", "file", "instructions"),
        ),
    ),
    Assistant(
        key="cline",
        name="Cline",
        artifacts=(Artifact("clinerules", ".clinerules", "file", "rules"),),
    ),
)

ASSISTANT_KEYS = {assistant.key for assistant in CATALOG}


def artifact_present(clone: Path, artifact: Artifact) -> bool:
    target = clone / artifact.path
    if artifact.kind == "dir":
        return target.is_dir() and any(target.iterdir())
    return target.is_file()


def scan_repo(clone_path: str) -> list[dict]:
    """Presence state for every assistant/artifact — shaped for AssistantState schemas."""
    clone = Path(clone_path)
    states: list[dict] = []
    for assistant in CATALOG:
        artifacts = [
            {
                "key": artifact.key,
                "path": artifact.path,
                "kind": artifact.kind,
                "role": artifact.role,
                "present": artifact_present(clone, artifact),
            }
            for artifact in assistant.artifacts
        ]
        states.append(
            {
                "key": assistant.key,
                "name": assistant.name,
                "detected": any(a["present"] for a in artifacts),
                "artifacts": artifacts,
            }
        )
    return states
