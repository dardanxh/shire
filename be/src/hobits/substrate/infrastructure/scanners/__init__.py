"""Scanner registry. Adding a scanner here is the only wiring a new one needs."""

from __future__ import annotations

from hobits.substrate.domain.ports import Scanner
from hobits.substrate.infrastructure.scanners.code import (
    CiCdScanner,
    DependencyScanner,
    LanguageScanner,
    LicenseScanner,
    TestPresenceScanner,
)
from hobits.substrate.infrastructure.scanners.enrichment import (
    CodeMetricsScanner,
    ComplexityScanner,
    HealthScanner,
    MaintainabilityScanner,
    SbomScanner,
    SecretsScanner,
    VulnerabilityScanner,
)
from hobits.substrate.infrastructure.scanners.git import GitStatsScanner, HotspotScanner


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


__all__ = ["default_scanners"]
