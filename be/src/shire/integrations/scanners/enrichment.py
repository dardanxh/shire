"""Enrichment scanners (Phase 1.5): complexity, maintainability, SBOM, vulns, secrets, health.

Each records a `ToolRun` so we always know which tools ran and whether they contributed. Missing
binaries / unsupported languages simply contribute nothing.
"""

from __future__ import annotations

import ast
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import lizard
from radon.metrics import mi_visit

from shire.core.settings import get_settings
from shire.domain.substrate.domain import (
    HealthCheck,
    ScanContext,
    ScanContribution,
    ToolRun,
    Vulnerability,
)
from shire.integrations.external_tools.bandit import BanditAdapter
from shire.integrations.external_tools.gitleaks import GitleaksAdapter
from shire.integrations.external_tools.osv import OsvScannerAdapter
from shire.integrations.external_tools.ruff import RuffAdapter
from shire.integrations.external_tools.scc import SccAdapter
from shire.integrations.external_tools.scorecard import ScorecardAdapter
from shire.integrations.external_tools.syft import SyftAdapter
from shire.integrations.external_tools.vulture import VultureAdapter
from shire.integrations.scanners._common import (
    LANG_BY_EXT,
    NON_CODE_LANGS,
    count_loc,
    walk_files,
)

_HIGH_CCN = 10
_LOG_MAX_LINES = 5000


def _tool(
    name: str, available: bool, contributed: bool, log: str | None = None
) -> list[ToolRun]:
    return [ToolRun(name=name, available=available, contributed=contributed, log=log)]


def _log(findings: list[str]) -> str | None:
    """Join finding lines into a stored log, capped so a noisy repo can't bloat the row."""
    if not findings:
        return None
    if len(findings) > _LOG_MAX_LINES:
        kept = [*findings[:_LOG_MAX_LINES], f"… {len(findings) - _LOG_MAX_LINES} more (truncated)"]
        return "\n".join(kept)
    return "\n".join(findings)


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
        findings = [
            f"[{v.severity}] {v.package}@{v.version or '?'} ({v.ecosystem}) {v.vuln_id}"
            + (f" → fixed in {v.fixed_version}" if v.fixed_version else "")
            for v in vulns
        ]
        return ScanContribution(
            vulnerabilities=vulns,
            tool_runs=_tool("osv-scanner", True, True, log=_log(findings)),
        )


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
        # Log the rule + location only — never the secret value.
        findings = [f"[{h.rule}] {h.file}:{h.line}" for h in result.hits]
        return ScanContribution(
            secret_count=result.count,
            tool_runs=_tool("gitleaks", True, True, log=_log(findings)),
        )


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


# --- Python quality (ruff / bandit / vulture) ---------------------------------


def _has_python(root: Path) -> bool:
    return any(p.suffix == ".py" for p in walk_files(root))


class LintScanner:
    """`ruff` — Python lint issue count (skipped when the repo has no Python)."""

    name = "lint"

    def scan(self, ctx: ScanContext) -> ScanContribution:
        adapter = RuffAdapter()
        if not adapter.is_available():
            return ScanContribution(tool_runs=_tool("ruff", False, False))
        if not _has_python(ctx.clone_path):
            return ScanContribution(tool_runs=_tool("ruff", True, False))
        result = adapter.run(ctx.clone_path)
        if result is None:
            return ScanContribution(tool_runs=_tool("ruff", True, False))
        return ScanContribution(
            lint_issue_count=result.issue_count,
            tool_runs=_tool("ruff", True, True, log=_log(result.findings)),
        )


class SastScanner:
    """`bandit` — Python security (SAST) issue counts by severity."""

    name = "sast"

    def scan(self, ctx: ScanContext) -> ScanContribution:
        adapter = BanditAdapter()
        if not adapter.is_available():
            return ScanContribution(tool_runs=_tool("bandit", False, False))
        if not _has_python(ctx.clone_path):
            return ScanContribution(tool_runs=_tool("bandit", True, False))
        result = adapter.run(ctx.clone_path)
        if result is None:
            return ScanContribution(tool_runs=_tool("bandit", True, False))
        return ScanContribution(
            sast_issue_count=result.issue_count,
            sast_high=result.high,
            sast_medium=result.medium,
            sast_low=result.low,
            tool_runs=_tool("bandit", True, True, log=_log(result.findings)),
        )


class DeadCodeScanner:
    """`vulture` — unused (dead) Python code count."""

    name = "dead_code"

    def scan(self, ctx: ScanContext) -> ScanContribution:
        adapter = VultureAdapter()
        if not adapter.is_available():
            return ScanContribution(tool_runs=_tool("vulture", False, False))
        if not _has_python(ctx.clone_path):
            return ScanContribution(tool_runs=_tool("vulture", True, False))
        result = adapter.run(ctx.clone_path)
        if result is None:
            return ScanContribution(tool_runs=_tool("vulture", True, False))
        return ScanContribution(
            dead_code_count=result.dead_code_count,
            tool_runs=_tool("vulture", True, True, log=_log(result.findings)),
        )


# --- test metrics (deterministic; no external binary) -------------------------

_TEST_DIRS = {"tests", "test", "spec", "__tests__"}
_TEST_CODE_EXT = {".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".rb", ".java"}
_PY_TEST_RE = re.compile(r"^test_.*\.py$|.*_test\.py$")
_JS_TEST_RE = re.compile(r".*\.(test|spec)\.[jt]sx?$")
_JS_CASE_RE = re.compile(r"\b(?:it|test)\s*\(")
_JS_ASSERT_RE = re.compile(r"\b(?:expect|assert)\s*\(")


def _is_test_file(path: Path) -> bool:
    suffix = path.suffix.lower()
    if suffix not in _TEST_CODE_EXT:
        return False
    if any(part in _TEST_DIRS for part in path.parts):
        return True
    name = path.name
    return bool(
        _PY_TEST_RE.match(name)
        or _JS_TEST_RE.match(name)
        or name.endswith("_test.go")
        or name.endswith("_spec.rb")
        or name.endswith("Test.java")
    )


def _count_tests(path: Path) -> tuple[int, int]:
    """Return (test_cases, assertions) for a single test file. AST for Python, regex for JS/TS."""
    suffix = path.suffix.lower()
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return 0, 0
    if suffix == ".py":
        try:
            tree = ast.parse(text)
        except (SyntaxError, ValueError):
            return 0, 0
        tests = assertions = 0
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef) and node.name.startswith(
                "test"
            ):
                tests += 1
            elif isinstance(node, ast.Assert) or (
                isinstance(node, ast.Call)
                and getattr(node.func, "attr", "").startswith("assert")
            ):
                assertions += 1
        return tests, assertions
    if suffix in {".js", ".jsx", ".ts", ".tsx"}:
        return len(_JS_CASE_RE.findall(text)), len(_JS_ASSERT_RE.findall(text))
    return 0, 0


def _pytest_configured(root: Path) -> bool:
    if (root / "pytest.ini").is_file() or (root / "conftest.py").is_file():
        return True
    pyproject = root / "pyproject.toml"
    if pyproject.is_file():
        try:
            return "[tool.pytest" in pyproject.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return False
    return False


def _js_frameworks(root: Path) -> set[str]:
    pkg = root / "package.json"
    if not pkg.is_file():
        return set()
    try:
        text = pkg.read_text(encoding="utf-8", errors="ignore").lower()
    except OSError:
        return set()
    return {fw for fw in ("jest", "vitest", "mocha", "jasmine", "cypress", "playwright") if fw in text}


def _detect_frameworks(root: Path, suffixes: set[str]) -> list[str]:
    found: set[str] = set()
    if ".py" in suffixes:
        found.add("pytest" if _pytest_configured(root) else "unittest")
    if ".go" in suffixes:
        found.add("go test")
    if ".rb" in suffixes:
        found.add("rspec")
    if ".java" in suffixes:
        found.add("junit")
    if suffixes & {".js", ".jsx", ".ts", ".tsx"}:
        found |= _js_frameworks(root)
    return sorted(found)


def _parse_coverage(root: Path) -> float | None:
    """Best-effort coverage % from a committed report — never by running the suite."""
    for name in ("coverage.xml", "cobertura.xml"):
        p = root / name
        if p.is_file():
            try:
                rate = ET.parse(p).getroot().get("line-rate")
                if rate is not None:
                    return round(float(rate) * 100, 2)
            except (ET.ParseError, ValueError, OSError):
                pass
    cj = root / "coverage.json"
    if cj.is_file():
        try:
            data = json.loads(cj.read_text(encoding="utf-8", errors="ignore"))
            pct = data.get("totals", {}).get("percent_covered")
            if isinstance(pct, (int, float)):
                return round(float(pct), 2)
        except (json.JSONDecodeError, OSError, AttributeError):
            pass
    lcov = root / "lcov.info"
    if not lcov.is_file():
        lcov = root / "coverage" / "lcov.info"
    if lcov.is_file():
        try:
            hit = found = 0
            for line in lcov.read_text(encoding="utf-8", errors="ignore").splitlines():
                if line.startswith("LH:"):
                    hit += int(line[3:])
                elif line.startswith("LF:"):
                    found += int(line[3:])
            if found:
                return round(hit / found * 100, 2)
        except (ValueError, OSError):
            pass
    return None


class TestMetricsScanner:
    """Deterministic test-suite metrics: counts, ratio, assertion density, frameworks, coverage."""

    name = "test_metrics"

    def scan(self, ctx: ScanContext) -> ScanContribution:
        test_files = test_count = assertions = test_loc = source_loc = 0
        suffixes: set[str] = set()
        for path in walk_files(ctx.clone_path):
            if _is_test_file(path):
                test_files += 1
                suffixes.add(path.suffix.lower())
                test_loc += count_loc(path)
                cases, asserts = _count_tests(path)
                test_count += cases
                assertions += asserts
            else:
                lang = LANG_BY_EXT.get(path.suffix.lower())
                if lang is not None and lang not in NON_CODE_LANGS:
                    source_loc += count_loc(path)

        coverage = _parse_coverage(ctx.clone_path)
        if test_files == 0 and coverage is None:
            return ScanContribution(tool_runs=_tool("test-metrics", True, False))

        frameworks = _detect_frameworks(ctx.clone_path, suffixes)
        return ScanContribution(
            test_count=test_count or None,
            test_file_count=test_files or None,
            test_to_code_ratio=round(test_loc / source_loc, 3) if source_loc else None,
            assertion_density=round(assertions / test_count, 2) if test_count else None,
            test_frameworks=", ".join(frameworks) or None,
            test_coverage_pct=coverage,
            tool_runs=_tool("test-metrics", True, True),
        )
