"""The inspection catalog: derived from the source registries, and honest about what the
bulk button is allowed to start."""

from __future__ import annotations

from shire.domain.inspections import catalog
from shire.domain.substrate import architecture
from shire.integrations.external_tools import tool_languages
from shire.integrations.scanners import tool_scanners


def test_keys_are_unique() -> None:
    keys = [entry.key for entry in catalog.CATALOG]
    assert len(keys) == len(set(keys))
    assert len(catalog.CATALOG_BY_KEY) == len(keys)


def test_every_architecture_kind_is_an_entry() -> None:
    """Adding a diagram kind must extend the checklist without touching this domain."""
    expected = {f"architecture:{kind.slug}" for kind in architecture.CATALOG}
    assert expected <= set(catalog.CATALOG_BY_KEY)
    assert len(expected) == len(architecture.CATALOG)


def test_every_tool_is_an_entry() -> None:
    expected = {f"tool:{tool_id}" for tool_id in tool_languages()}
    assert expected <= set(catalog.CATALOG_BY_KEY)
    # The scanner tools and the four viz tools together are the whole integration group.
    integrations = {e.key for e in catalog.CATALOG if e.group == catalog.INTEGRATION}
    assert integrations == expected
    assert frozenset(tool_scanners()) == catalog.SCANNER_TOOL_IDS
    assert set(catalog.VIZ_TOOLS) <= set(tool_languages())
    assert set(catalog.VIZ_TOOLS).isdisjoint(catalog.SCANNER_TOOL_IDS)


def test_bulk_set_is_the_ai_analyses_only() -> None:
    """The table's bulk button starts the enumerated AI analyses — never a hobit, a principle
    audit, an integration, or the readiness suggester."""
    assert set(catalog.BULK_KEYS) == {
        "codebase-overview",
        "tech-stack",
        "cicd",
        "dependencies-ai",
        "dependency-freshness",
        *(f"architecture:{kind.slug}" for kind in architecture.CATALOG),
    }
    assert "ai-readiness" not in catalog.BULK_KEYS
    assert not any(key.startswith(catalog.TOOL_PREFIX) for key in catalog.BULK_KEYS)
    assert not any("hobit" in key or "principle" in key for key in catalog.CATALOG_BY_KEY)


def test_groups_and_blocking_flags() -> None:
    for entry in catalog.CATALOG:
        assert entry.group in (catalog.AI, catalog.INTEGRATION)
        # Every integration shells out to a subprocess, so none may run inline in a request.
        if entry.group == catalog.INTEGRATION:
            assert entry.blocking
    # Dependency freshness fetches from PyPI inline before its AI follow-up job.
    assert catalog.CATALOG_BY_KEY["dependency-freshness"].blocking
    assert not catalog.CATALOG_BY_KEY["codebase-overview"].blocking


def test_key_accessors() -> None:
    assert catalog.CATALOG_BY_KEY["tool:gitleaks"].tool_id == "gitleaks"
    assert catalog.CATALOG_BY_KEY["tool:gitleaks"].architecture_kind is None
    assert catalog.CATALOG_BY_KEY["architecture:component"].architecture_kind == "component"
    assert catalog.CATALOG_BY_KEY["architecture:component"].tool_id is None
    assert catalog.CATALOG_BY_KEY["codebase-overview"].tool_id is None
