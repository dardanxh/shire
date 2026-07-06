"""Phase 1.5 enrichment value objects: metrics from external tools + derived ratings."""

from __future__ import annotations

from enum import StrEnum

from pydantic import Field

from hobits.shared.domain.base import ValueObject


class Rating(StrEnum):
    a = "A"
    b = "B"
    c = "C"
    d = "D"
    e = "E"
    na = "NA"


class Ratings(ValueObject):
    """Derived A-E ratings (NA when the underlying tool didn't run)."""

    maintainability: Rating = Rating.na
    security: Rating = Rating.na
    health: Rating = Rating.na


class Vulnerability(ValueObject):
    package: str
    ecosystem: str
    version: str | None = None
    vuln_id: str
    severity: str
    fixed_version: str | None = None


class HealthCheck(ValueObject):
    name: str
    score: int  # 0-10, or -1 when inconclusive
    reason: str


class ToolRun(ValueObject):
    """Which external tool ran for an analysis and whether it contributed data."""

    name: str
    available: bool
    contributed: bool


class Enrichment(ValueObject):
    """Scalar enrichment bundle embedded on an Analysis (all tool-sourced, best-effort)."""

    # scc — code metrics
    code_lines: int | None = None
    complexity_total: int | None = None
    cocomo_cost_usd: float | None = None
    schedule_months: float | None = None
    # lizard — complexity
    ccn_average: float | None = None
    ccn_max: int | None = None
    function_count: int | None = None
    high_complexity_count: int | None = None
    # radon — maintainability (Python)
    maintainability_index: float | None = None
    # syft — SBOM
    sbom_package_count: int | None = None
    # osv-scanner — vulnerabilities
    vulnerability_count: int = 0
    vuln_critical: int = 0
    vuln_high: int = 0
    vuln_moderate: int = 0
    vuln_low: int = 0
    # gitleaks — secrets
    secret_count: int = 0
    # scorecard — health
    health_score: float | None = None
    # derived
    ratings: Ratings = Field(default_factory=Ratings)
