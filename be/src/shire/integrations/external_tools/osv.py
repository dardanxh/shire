"""Adapter for `osv-scanner` — dependency vulnerabilities from the OSV database."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from shire.integrations.external_tools.base import ExternalTool, ToolSpec

_SEVERITY_ORDER = ("CRITICAL", "HIGH", "MODERATE", "LOW", "UNKNOWN")


def _cvss_to_bucket(score: float) -> str:
    if score >= 9.0:
        return "CRITICAL"
    if score >= 7.0:
        return "HIGH"
    if score >= 4.0:
        return "MODERATE"
    if score > 0:
        return "LOW"
    return "UNKNOWN"


@dataclass(frozen=True)
class VulnFinding:
    package: str
    ecosystem: str
    version: str | None
    vuln_id: str
    severity: str
    fixed_version: str | None


@dataclass(frozen=True)
class OsvResult:
    findings: list[VulnFinding] = field(default_factory=list)
    count: int = 0
    by_severity: dict[str, int] = field(default_factory=dict)


class OsvScannerAdapter(ExternalTool):
    spec = ToolSpec(
        name="osv-scanner",
        purpose="Known vulnerabilities (CVEs) in dependencies via Google's OSV database.",
        homepage="https://github.com/google/osv-scanner",
        install="brew install osv-scanner",
        install_argv=(("brew", "install", "osv-scanner"),),
        category="security",
    )

    def run(self, clone_path: Path) -> OsvResult | None:
        # osv-scanner exits non-zero when vulns are found — tolerate it and parse the JSON.
        proc = self._run(
            ["osv-scanner", "scan", "source", "-r", "--format", "json", str(clone_path)],
            timeout=300,
        )
        if proc is None:
            return None
        data = self._parse_json(proc.stdout)
        if not isinstance(data, dict):
            return OsvResult()  # ran, but no lockfiles / no JSON → no vulns

        findings: list[VulnFinding] = []
        for result in data.get("results", []):
            for pkg in result.get("packages", []):
                info = pkg.get("package", {})
                fixed = _first_fixed(pkg)
                sev_by_id = _severity_by_id(pkg)
                for vuln in pkg.get("vulnerabilities", []):
                    vid = vuln.get("id", "?")
                    findings.append(
                        VulnFinding(
                            package=info.get("name", "?"),
                            ecosystem=info.get("ecosystem", "?"),
                            version=info.get("version"),
                            vuln_id=vid,
                            severity=sev_by_id.get(vid, _vuln_severity(vuln)),
                            fixed_version=fixed,
                        )
                    )
        return OsvResult(
            findings=findings,
            count=len(findings),
            by_severity=dict(Counter(f.severity for f in findings)),
        )


def _severity_by_id(pkg: dict) -> dict[str, str]:
    """`groups` carries max_severity (CVSS) keyed by the vuln ids it covers."""
    out: dict[str, str] = {}
    for group in pkg.get("groups", []):
        raw = group.get("max_severity", "")
        try:
            bucket = _cvss_to_bucket(float(raw)) if raw else "UNKNOWN"
        except (TypeError, ValueError):
            bucket = "UNKNOWN"
        for vid in group.get("ids", []):
            out[vid] = bucket
    return out


def _vuln_severity(vuln: dict) -> str:
    label = str(vuln.get("database_specific", {}).get("severity", "")).upper()
    return label if label in _SEVERITY_ORDER else "UNKNOWN"


def _first_fixed(pkg: dict) -> str | None:
    for vuln in pkg.get("vulnerabilities", []):
        for affected in vuln.get("affected", []):
            for rng in affected.get("ranges", []):
                for event in rng.get("events", []):
                    if "fixed" in event:
                        return event["fixed"]
    return None
