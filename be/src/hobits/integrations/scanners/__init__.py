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
    HealthScanner,
    MaintainabilityScanner,
    SbomScanner,
    SecretsScanner,
    VulnerabilityScanner,
)
from hobits.integrations.scanners.git import GitStatsScanner, HotspotScanner


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
        # Phase 1.5 enrichment (external tools; degrade gracefully)
        CodeMetricsScanner(),
        ComplexityScanner(),
        MaintainabilityScanner(),
        SbomScanner(),
        VulnerabilityScanner(),
        SecretsScanner(),
        HealthScanner(),
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
    }


__all__ = ["default_scanners", "tool_scanners"]
