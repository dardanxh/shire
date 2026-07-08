"""Scanner registry. Adding a scanner here is the only wiring a new one needs."""

from __future__ import annotations

from hobits.domain.substrate.domain import Scanner
from hobits.integrations.scanners.code import (
    CiCdScanner,
    DependencyScanner,
    LanguageScanner,
    LicenseScanner,
    TestPresenceScanner,
)
from hobits.integrations.scanners.enrichment import (
    CodeMetricsScanner,
    ComplexityScanner,
    DeadCodeScanner,
    HealthScanner,
    LintScanner,
    MaintainabilityScanner,
    SastScanner,
    SbomScanner,
    SecretsScanner,
    TestMetricsScanner,
    VulnerabilityScanner,
)
from hobits.integrations.scanners.git import (
    GitStatsScanner,
    HotspotScanner,
    OwnershipScanner,
)


def base_scanners() -> list[Scanner]:
    """Always-on substrate scanners (L1/L2 facts). Run regardless of which integrations are linked;
    they establish the base facts (languages, commits, deps, license, tests) the rest builds on."""
    return [
        GitStatsScanner(),
        LanguageScanner(),
        DependencyScanner(),
        CiCdScanner(),
        LicenseScanner(),
        TestPresenceScanner(),
        HotspotScanner(),
    ]


def default_scanners() -> list[Scanner]:
    return [
        # L1 / L2 deterministic (always on)
        GitStatsScanner(),
        LanguageScanner(),
        DependencyScanner(),
        CiCdScanner(),
        LicenseScanner(),
        TestPresenceScanner(),
        HotspotScanner(),
        OwnershipScanner(),
        # Phase 1.5 enrichment (external tools; degrade gracefully)
        CodeMetricsScanner(),
        ComplexityScanner(),
        MaintainabilityScanner(),
        SbomScanner(),
        VulnerabilityScanner(),
        SecretsScanner(),
        HealthScanner(),
        # Testing + Python quality
        TestMetricsScanner(),
        LintScanner(),
        SastScanner(),
        DeadCodeScanner(),
    ]


# Map an external-tool name (as reported by GET /tools) to the scanner that runs it, for
# on-demand single-tool runs.
def tool_scanners() -> dict[str, Scanner]:
    return {
        "scc": CodeMetricsScanner(),
        "lizard": ComplexityScanner(),
        "radon": MaintainabilityScanner(),
        "syft": SbomScanner(),
        "osv-scanner": VulnerabilityScanner(),
        "gitleaks": SecretsScanner(),
        "scorecard": HealthScanner(),
        "test-metrics": TestMetricsScanner(),
        "ruff": LintScanner(),
        "bandit": SastScanner(),
        "vulture": DeadCodeScanner(),
        "ownership": OwnershipScanner(),
    }


__all__ = ["base_scanners", "default_scanners", "tool_scanners"]
