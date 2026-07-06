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
from hobits.substrate.infrastructure.scanners.git import GitStatsScanner, HotspotScanner


def default_scanners() -> list[Scanner]:
    return [
        GitStatsScanner(),
        LanguageScanner(),
        DependencyScanner(),
        CiCdScanner(),
        LicenseScanner(),
        TestPresenceScanner(),
        HotspotScanner(),
    ]


__all__ = ["default_scanners"]
