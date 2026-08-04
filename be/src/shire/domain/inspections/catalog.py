"""The catalog of inspections a repository can have run against it.

One entry per thing a user can start: the Claude-driven analyses (codebase overview, one
architecture diagram per kind, tech stack, CI/CD, dependency AI scan, dependency freshness,
AI readiness) and the deterministic integrations (scanner tools + visualization artifacts).

The entries are *derived* from the registries that already own those lists — the architecture
`CATALOG`, `tool_scanners()`, and `tool_languages()` — so adding a diagram kind or an
integration extends the checklist, the completion counts and the bulk runner at once.

Hobits and principles are deliberately absent: they stay hand-assigned per repository.
"""

from __future__ import annotations

from dataclasses import dataclass

from shire.domain.substrate import architecture
from shire.integrations.external_tools import tool_languages
from shire.integrations.scanners import tool_scanners

AI = "ai"
INTEGRATION = "integration"

# Tools with their own artifact endpoint rather than the generic scanner tool-run flow.
VIZ_TOOLS = ("emerge", "git-of-theseus", "code-maat", "codecharta")

TOOL_PREFIX = "tool:"
ARCHITECTURE_PREFIX = "architecture:"


@dataclass(frozen=True)
class Inspection:
    key: str
    group: str  # AI | INTEGRATION
    # Started by the repositories table's bulk "Run AI analysis" button. False for the
    # integrations (they shell out to subprocesses, some for minutes — running 16 of them
    # across a page of selected repos would saturate the host) and for AI readiness, which
    # the bulk request deliberately leaves out.
    bulk: bool
    # Runs inline instead of enqueuing an engine job — the caller must hand it to a
    # background task so the request doesn't hold the connection open.
    blocking: bool

    @property
    def tool_id(self) -> str | None:
        return self.key.removeprefix(TOOL_PREFIX) if self.group == INTEGRATION else None

    @property
    def architecture_kind(self) -> str | None:
        if not self.key.startswith(ARCHITECTURE_PREFIX):
            return None
        return self.key.removeprefix(ARCHITECTURE_PREFIX)


def _ai_entries() -> tuple[Inspection, ...]:
    diagrams = tuple(
        Inspection(f"{ARCHITECTURE_PREFIX}{kind.slug}", AI, bulk=True, blocking=False)
        for kind in architecture.CATALOG
    )
    return (
        Inspection("codebase-overview", AI, bulk=True, blocking=False),
        *diagrams,
        Inspection("tech-stack", AI, bulk=True, blocking=False),
        Inspection("cicd", AI, bulk=True, blocking=False),
        Inspection("dependencies-ai", AI, bulk=True, blocking=False),
        # Deterministic PyPI fetch first, then an engine job for the "what you gain" lines.
        Inspection("dependency-freshness", AI, bulk=True, blocking=True),
        Inspection("ai-readiness", AI, bulk=False, blocking=False),
    )


def _integration_entries() -> tuple[Inspection, ...]:
    return tuple(
        Inspection(f"{TOOL_PREFIX}{tool_id}", INTEGRATION, bulk=False, blocking=True)
        for tool_id in sorted(tool_languages())
    )


CATALOG: tuple[Inspection, ...] = _ai_entries() + _integration_entries()
CATALOG_BY_KEY: dict[str, Inspection] = {entry.key: entry for entry in CATALOG}
BULK_KEYS: tuple[str, ...] = tuple(entry.key for entry in CATALOG if entry.bulk)

# Scanner tools run through `AnalysisService.run_tool`; the viz four have dedicated endpoints.
SCANNER_TOOL_IDS: frozenset[str] = frozenset(tool_scanners())
