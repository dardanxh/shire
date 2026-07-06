"""Enrichment scanners (Phase 1.5): complexity, maintainability, SBOM, vulns, secrets, health.

Each records a `ToolRun` so we always know which tools ran and whether they contributed. Missing
binaries / unsupported languages simply contribute nothing.
"""

from __future__ import annotations

import lizard
from radon.metrics import mi_visit

from hobits.shared.infrastructure.settings import get_settings
from hobits.substrate.domain.enrichment import HealthCheck, ToolRun, Vulnerability
from hobits.substrate.domain.ports import ScanContext, ScanContribution
from hobits.substrate.infrastructure.external_tools.gitleaks import GitleaksAdapter
from hobits.substrate.infrastructure.external_tools.osv import OsvScannerAdapter
from hobits.substrate.infrastructure.external_tools.scc import SccAdapter
from hobits.substrate.infrastructure.external_tools.scorecard import ScorecardAdapter
from hobits.substrate.infrastructure.external_tools.syft import SyftAdapter
from hobits.substrate.infrastructure.scanners._common import (
    LANG_BY_EXT,
    NON_CODE_LANGS,
    walk_files,
)

_HIGH_CCN = 10


def _tool(name: str, available: bool, contributed: bool) -> list[ToolRun]:
    return [ToolRun(name=name, available=available, contributed=contributed)]


class CodeMetricsScanner:
    """`scc` — accurate code lines + total complexity + COCOMO cost estimate."""

    name = "scc_metrics"

    def scan(self, ctx: ScanContext) -> ScanContribution:
        adapter = SccAdapter()
        if not adapter.is_available():
            return ScanContribution(tool_runs=_tool("scc", False, False))
        result = adapter.run(ctx.clone_path)
        if result is None:
            return ScanContribution(tool_runs=_tool("scc", True, False))
        return ScanContribution(
            code_lines=result.total_code,
            complexity_total=result.total_complexity,
            cocomo_cost_usd=round(result.cocomo_cost_usd, 2),
            schedule_months=round(result.schedule_months, 2),
            tool_runs=_tool("scc", True, True),
        )


class ComplexityScanner:
    """`lizard` — multi-language cyclomatic complexity across functions."""

    name = "complexity"

    def scan(self, ctx: ScanContext) -> ScanContribution:
        complexities: list[int] = []
        for path in walk_files(ctx.clone_path):
            lang = LANG_BY_EXT.get(path.suffix.lower())
            if lang is None or lang in NON_CODE_LANGS:
                continue
            try:
                info = lizard.analyze_file(str(path))
            except Exception:
                continue
            complexities.extend(fn.cyclomatic_complexity for fn in info.function_list)

        if not complexities:
            return ScanContribution(tool_runs=_tool("lizard", True, False))
        return ScanContribution(
            ccn_average=round(sum(complexities) / len(complexities), 2),
            ccn_max=max(complexities),
            function_count=len(complexities),
            high_complexity_count=sum(1 for c in complexities if c > _HIGH_CCN),
            tool_runs=_tool("lizard", True, True),
        )


class MaintainabilityScanner:
    """`radon` — Python Maintainability Index (averaged across modules)."""

    name = "maintainability"

    def scan(self, ctx: ScanContext) -> ScanContribution:
        scores: list[float] = []
        for path in walk_files(ctx.clone_path):
            if path.suffix.lower() != ".py":
                continue
            try:
                code = path.read_text(encoding="utf-8", errors="ignore")
                scores.append(mi_visit(code, multi=True))
            except Exception:
                continue
        if not scores:
            return ScanContribution(tool_runs=_tool("radon", True, False))
        return ScanContribution(
            maintainability_index=round(sum(scores) / len(scores), 2),
            tool_runs=_tool("radon", True, True),
        )


class SbomScanner:
    """`syft` — SBOM package count (resolved + transitive)."""

    name = "sbom"

    def scan(self, ctx: ScanContext) -> ScanContribution:
        adapter = SyftAdapter()
        if not adapter.is_available():
            return ScanContribution(tool_runs=_tool("syft", False, False))
        result = adapter.run(ctx.clone_path)
        if result is None:
            return ScanContribution(tool_runs=_tool("syft", True, False))
        return ScanContribution(
            sbom_package_count=result.count, tool_runs=_tool("syft", True, True)
        )


class VulnerabilityScanner:
    """`osv-scanner` — known vulnerabilities in dependencies."""

    name = "vulnerabilities"

    def scan(self, ctx: ScanContext) -> ScanContribution:
        adapter = OsvScannerAdapter()
        if not adapter.is_available():
            return ScanContribution(tool_runs=_tool("osv-scanner", False, False))
        result = adapter.run(ctx.clone_path)
        if result is None:
            return ScanContribution(tool_runs=_tool("osv-scanner", True, False))
        vulns = [
            Vulnerability(
                package=f.package,
                ecosystem=f.ecosystem,
                version=f.version,
                vuln_id=f.vuln_id,
                severity=f.severity,
                fixed_version=f.fixed_version,
            )
            for f in result.findings
        ]
        return ScanContribution(vulnerabilities=vulns, tool_runs=_tool("osv-scanner", True, True))


class SecretsScanner:
    """`gitleaks` — count of committed secrets (values never stored)."""

    name = "secrets"

    def scan(self, ctx: ScanContext) -> ScanContribution:
        adapter = GitleaksAdapter()
        if not adapter.is_available():
            return ScanContribution(tool_runs=_tool("gitleaks", False, False))
        result = adapter.run(ctx.clone_path)
        if result is None:
            return ScanContribution(tool_runs=_tool("gitleaks", True, False))
        return ScanContribution(secret_count=result.count, tool_runs=_tool("gitleaks", True, True))


class HealthScanner:
    """OpenSSF `scorecard` — repo health/security rating (needs a GitHub token + URL)."""

    name = "health"

    def scan(self, ctx: ScanContext) -> ScanContribution:
        adapter = ScorecardAdapter()
        if not adapter.is_available():
            return ScanContribution(tool_runs=_tool("scorecard", False, False))
        token = get_settings().github_token
        if not ctx.repo_url or not token:
            return ScanContribution(tool_runs=_tool("scorecard", True, False))
        result = adapter.run(ctx.repo_url, token)
        if result is None:
            return ScanContribution(tool_runs=_tool("scorecard", True, False))
        checks = [HealthCheck(name=c.name, score=c.score, reason=c.reason) for c in result.checks]
        return ScanContribution(
            health_score=result.score,
            health_checks=checks,
            tool_runs=_tool("scorecard", True, True),
        )
