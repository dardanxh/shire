"""The context pack shape (`RepoContextResult`) + its section models and a Markdown rendering.

This is the agent's first-read layer: one document that folds a repository's whole current snapshot
(facts, metrics, security, people, structure, dependencies, tool coverage) into named sections.
The domain value objects (Contributor, Hotspot, Vulnerability, …) are reused verbatim as leaf types.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from shire.domain.substrate.domain import (
    CiCdConfig,
    Contributor,
    Dependency,
    HealthCheck,
    Hotspot,
    LanguageStat,
    Vulnerability,
)
from shire.domain.substrate.schemas import CodeAgeCohort, CouplingPair, FactsResult


class ContextIdentity(BaseModel):
    repository_id: uuid.UUID
    provider: str
    owner: str
    name: str
    slug: str
    url: str
    default_branch: str
    status: str
    commit_sha: str
    clone_path: str | None
    generated_at: datetime


class ContextSummary(BaseModel):
    """The agent's TL;DR — everything needed to size up the repo at a glance."""

    rating_maintainability: str
    rating_security: str
    rating_health: str
    primary_language: str | None
    loc_total: int
    age_days: int | None
    commit_count: int
    contributor_count: int
    dependency_count: int
    has_tests: bool
    maintenance_status: str | None
    bus_factor: int | None
    open_vulnerabilities: int
    secret_count: int
    health_score: float | None


class ContextMetrics(BaseModel):
    """L2 enrichment — size, complexity, maintainability, cost, tests, quality gates."""

    code_lines: int | None
    complexity_total: int | None
    ccn_average: float | None
    ccn_max: int | None
    function_count: int | None
    high_complexity_count: int | None
    maintainability_index: float | None
    cocomo_cost_usd: float | None
    schedule_months: float | None
    test_count: int | None
    test_file_count: int | None
    test_to_code_ratio: float | None
    test_coverage_pct: float | None
    lint_issue_count: int | None
    sast_issue_count: int | None
    dead_code_count: int | None


class ContextSecurity(BaseModel):
    vulnerability_count: int
    vuln_critical: int
    vuln_high: int
    vuln_moderate: int
    vuln_low: int
    secret_count: int
    top_vulnerabilities: list[Vulnerability]
    health_score: float | None
    health_checks: list[HealthCheck]


class ContextPeople(BaseModel):
    contributor_count: int
    bus_factor: int | None
    top_author_share: float | None
    active_contributor_count: int | None
    top_contributors: list[Contributor]


class ContextStructure(BaseModel):
    languages: list[LanguageStat]
    hotspots: list[Hotspot]
    coupling: list[CouplingPair]
    code_age: list[CodeAgeCohort]
    cicd: list[CiCdConfig]
    graph_generated: bool
    code_map_generated: bool


class ContextDependencies(BaseModel):
    count: int
    items: list[Dependency]  # truncated to a representative slice
    truncated: bool


class ContextToolCoverage(BaseModel):
    """What the agent can and cannot trust — its blind spots.

    `contributed` ran and produced data; `ran_no_data` ran but found nothing / didn't apply;
    `unavailable` are linked tools whose binary is missing on the server.
    """

    contributed: list[str]
    ran_no_data: list[str]
    unavailable: list[str]


class ContextDrilldown(BaseModel):
    """How the agent goes deeper when the pack isn't enough (Layers 2 & 3)."""

    clone_path: str | None
    tools: list[str]
    suggested_entry_files: list[str]


class ContextMarkdownResult(BaseModel):
    """The context pack as Markdown, with the user's override surfaced separately.

    `generated` is always the freshly-rendered pack; `edited` is the user's saved override (or
    None); `effective` is what the agent/UI should treat as the context (edited when present).
    """

    repository_id: uuid.UUID
    commit_sha: str
    generated_at: datetime
    generated: str
    edited: str | None
    effective: str
    is_edited: bool
    # The L3 mental model (hobit-authored), surfaced on its own — always visible even when the pack
    # Markdown is overridden. None until a Repo-Onboarding run completes.
    narrative: str | None


class ContextMarkdownUpdate(BaseModel):
    """Save a user-authored Markdown override for a repository's context."""

    markdown: str


class RepoContextResult(BaseModel):
    identity: ContextIdentity
    summary: ContextSummary
    facts: FactsResult
    metrics: ContextMetrics
    security: ContextSecurity
    people: ContextPeople
    structure: ContextStructure
    dependencies: ContextDependencies
    tool_coverage: ContextToolCoverage
    narrative: str | None = None  # reserved L3 slot (LLM-authored mental model)
    drilldown: ContextDrilldown

    def to_markdown(self) -> str:
        """Render the pack as compact Markdown for LLM consumption."""
        return _to_markdown(self)


# --- markdown rendering -------------------------------------------------------


def _fmt(value: object) -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:,.2f}".rstrip("0").rstrip(".")
    if isinstance(value, bool):
        return "yes" if value else "no"
    return str(value)


def _to_markdown(c: RepoContextResult) -> str:
    i, s, m = c.identity, c.summary, c.metrics
    lines: list[str] = []
    lines.append(f"# {i.slug} — repository context")
    lines.append("")
    lines.append(
        f"{i.provider} · `{i.default_branch}` · status: {i.status} · "
        f"commit `{i.commit_sha[:10]}` · generated {i.generated_at:%Y-%m-%d %H:%M UTC}"
    )
    lines.append(f"<{i.url}>")
    lines.append("")

    lines.append("## Summary")
    lines.append(
        f"- Ratings — maintainability **{s.rating_maintainability}**, "
        f"security **{s.rating_security}**, health **{s.rating_health}**"
    )
    lines.append(
        f"- {_fmt(s.primary_language)} · {_fmt(s.loc_total)} LOC · "
        f"age {_fmt(s.age_days)}d · {_fmt(s.commit_count)} commits · "
        f"{_fmt(s.contributor_count)} contributors"
    )
    lines.append(
        f"- Maintenance: {_fmt(s.maintenance_status)} · bus factor {_fmt(s.bus_factor)} · "
        f"tests: {_fmt(s.has_tests)} · {_fmt(s.dependency_count)} deps"
    )
    lines.append(
        f"- Security: {_fmt(s.open_vulnerabilities)} vulns · {_fmt(s.secret_count)} secrets · "
        f"health score {_fmt(s.health_score)}"
    )
    lines.append("")

    lines.append("## Metrics")
    lines.append(
        f"- Complexity: avg CCN {_fmt(m.ccn_average)}, max {_fmt(m.ccn_max)}, "
        f"{_fmt(m.function_count)} functions ({_fmt(m.high_complexity_count)} high-complexity)"
    )
    lines.append(
        f"- Maintainability index: {_fmt(m.maintainability_index)} · "
        f"COCOMO: ${_fmt(m.cocomo_cost_usd)} / {_fmt(m.schedule_months)} months"
    )
    lines.append(
        f"- Tests: {_fmt(m.test_count)} ({_fmt(m.test_file_count)} files), "
        f"coverage {_fmt(m.test_coverage_pct)}% · lint {_fmt(m.lint_issue_count)} · "
        f"SAST {_fmt(m.sast_issue_count)} · dead code {_fmt(m.dead_code_count)}"
    )
    lines.append("")

    if c.security.top_vulnerabilities:
        lines.append("## Top vulnerabilities")
        for v in c.security.top_vulnerabilities:
            fixed = f" (fixed in {v.fixed_version})" if v.fixed_version else ""
            lines.append(f"- [{v.severity}] {v.package} {_fmt(v.version)} — {v.vuln_id}{fixed}")
        lines.append("")

    if c.people.top_contributors:
        lines.append("## People")
        lines.append(
            f"Bus factor {_fmt(c.people.bus_factor)} · top-author share "
            f"{_fmt(c.people.top_author_share)} · {_fmt(c.people.active_contributor_count)} active"
        )
        for p in c.people.top_contributors:
            lines.append(f"- {p.name} — {p.commits} commits")
        lines.append("")

    if c.structure.languages:
        lines.append("## Languages")
        for lang in c.structure.languages:
            lines.append(f"- {lang.language}: {_fmt(lang.loc)} LOC ({_fmt(lang.pct)}%)")
        lines.append("")

    if c.structure.hotspots:
        lines.append("## Hotspots (churn x size)")
        for h in c.structure.hotspots:
            lines.append(f"- {h.path} — churn {h.churn}, size {h.size}")
        lines.append("")

    if c.structure.coupling:
        lines.append("## Temporal coupling")
        for pair in c.structure.coupling:
            lines.append(f"- {pair.entity} ↔ {pair.coupled} ({_fmt(pair.degree)}%)")
        lines.append("")

    if c.dependencies.items:
        suffix = (
            f" (showing {len(c.dependencies.items)} of {c.dependencies.count})"
            if c.dependencies.truncated
            else ""
        )
        lines.append(f"## Dependencies{suffix}")
        for d in c.dependencies.items:
            lines.append(f"- {d.ecosystem}: {d.name} {_fmt(d.version)}")
        lines.append("")

    tc = c.tool_coverage
    lines.append("## Tool coverage")
    lines.append(f"- Contributed: {', '.join(tc.contributed) or '—'}")
    if tc.ran_no_data:
        lines.append(f"- Ran, no data: {', '.join(tc.ran_no_data)}")
    if tc.unavailable:
        lines.append(f"- Unavailable (blind spots): {', '.join(tc.unavailable)}")
    lines.append("")

    d = c.drilldown
    lines.append("## Drill down")
    lines.append(f"- Tools: {', '.join(d.tools)}")
    if d.suggested_entry_files:
        lines.append(f"- Start with: {', '.join(d.suggested_entry_files)}")
    lines.append("")

    return "\n".join(lines)
