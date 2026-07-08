"""Context domain service: assemble (and cache) the per-repo context pack.

The pack is a pure function of a repository's latest analysis + its cached artifact state. We
fingerprint those inputs into a `source_hash`; a read returns the stored document when the hash
still matches and rebuilds otherwise (lazy materialization — no background job, which fits the
sync/no-scheduler backend). Substrate data is read service-to-service via `AnalysisService`.
"""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from hobits.core.exceptions import NotFoundError
from hobits.domain.context.domain import StoredContextPack
from hobits.domain.context.repositories import SqlContextPackRepository
from hobits.domain.context.schemas import (
    ContextDependencies,
    ContextDrilldown,
    ContextIdentity,
    ContextMarkdownResult,
    ContextMetrics,
    ContextPeople,
    ContextSecurity,
    ContextStructure,
    ContextSummary,
    ContextToolCoverage,
    RepoContextResult,
)
from hobits.domain.repository.domain import Repository
from hobits.domain.repository.repositories import SqlRepositoryRepository
from hobits.domain.substrate.schemas import (
    AnalysisResult,
    CodeAgeResult,
    CodeMapResult,
    CouplingResult,
    GraphResult,
)
from hobits.domain.substrate.services import AnalysisService

# How much of each ranked collection to surface in the pack (keep it agent-digestible).
_TOP_VULNERABILITIES = 20
_TOP_CONTRIBUTORS = 10
_TOP_HOTSPOTS = 15
_TOP_COUPLING = 20
_MAX_DEPENDENCIES = 100

_SEVERITY_RANK = {"CRITICAL": 0, "HIGH": 1, "MODERATE": 2, "MEDIUM": 2, "LOW": 3}

# Tools the agent can call to go deeper than the pack (Layers 2 & 3).
_DRILLDOWN_TOOLS = ("search_code", "read_file")


@dataclass(frozen=True)
class _ArtifactState:
    graph: GraphResult
    code_age: CodeAgeResult
    coupling: CouplingResult
    code_map: CodeMapResult


class ContextService:
    """Business logic for the context pack. Constructed per request from a DB session."""

    def __init__(self, session: Session) -> None:
        self._analysis = AnalysisService(session)
        # Cross-domain read for repo metadata incl. clone_path (mirrors AnalysisService, which
        # reaches for the clone path the same way — RepositoryResult doesn't expose it).
        self._repos = SqlRepositoryRepository(session)
        self._store = SqlContextPackRepository(session)

    def get_context(
        self, repository_id: uuid.UUID, *, refresh: bool = False
    ) -> RepoContextResult:
        analysis = self._analysis.latest_result(repository_id)  # raises if no analysis yet
        repo = self._repos.get(repository_id)
        if repo is None:
            raise NotFoundError("Repository not found")
        artifacts = self._artifact_state(repository_id)
        source_hash = _compute_hash(analysis, artifacts)
        stored = self._store.get(repository_id)

        if not refresh and stored is not None and stored.source_hash == source_hash:
            pack = RepoContextResult.model_validate(stored.document)
        else:
            pack = _build_pack(repo, analysis, artifacts)
            self._store.upsert(
                StoredContextPack(
                    repository_id=repository_id,
                    commit_sha=analysis.commit_sha,
                    source_hash=source_hash,
                    document=pack.model_dump(mode="json"),
                    generated_at=pack.identity.generated_at,
                )
            )
        # Overlay the hobit-authored narrative (like edited_markdown, it's not part of source_hash
        # and survives regeneration). `stored` is read before upsert, which never touches narrative.
        pack.narrative = stored.narrative if stored else None
        return pack

    def set_narrative(self, repository_id: uuid.UUID, narrative: str | None) -> None:
        """Persist the L3 mental-model narrative (written by the Repo-Onboarding hobit)."""
        self.get_context(repository_id)  # ensure the pack row exists before overlaying
        self._store.set_narrative(repository_id, narrative)

    # --- markdown (editable override layer) -----------------------------------
    def get_markdown(self, repository_id: uuid.UUID) -> ContextMarkdownResult:
        """The pack rendered as Markdown, with any saved user override surfaced separately."""
        pack = self.get_context(repository_id)  # ensures a fresh, cached pack exists
        stored = self._store.get(repository_id)
        edited = stored.edited_markdown if stored else None
        generated = pack.to_markdown()
        return ContextMarkdownResult(
            repository_id=repository_id,
            commit_sha=pack.identity.commit_sha,
            generated_at=pack.identity.generated_at,
            generated=generated,
            edited=edited,
            effective=edited if edited is not None else generated,
            is_edited=edited is not None,
            narrative=pack.narrative,
        )

    def save_markdown(
        self, repository_id: uuid.UUID, markdown: str
    ) -> ContextMarkdownResult:
        """Persist a user-authored Markdown override (survives regeneration)."""
        self.get_context(repository_id)  # ensure the pack row exists before overriding
        self._store.set_edited_markdown(repository_id, markdown)
        return self.get_markdown(repository_id)

    def clear_markdown(self, repository_id: uuid.UUID) -> ContextMarkdownResult:
        """Drop the override and fall back to the generated Markdown."""
        self._store.set_edited_markdown(repository_id, None)
        return self.get_markdown(repository_id)

    def _artifact_state(self, repository_id: uuid.UUID) -> _ArtifactState:
        return _ArtifactState(
            graph=self._analysis.graph_status(repository_id),
            code_age=self._analysis.code_age_status(repository_id),
            coupling=self._analysis.coupling_status(repository_id),
            code_map=self._analysis.code_map_status(repository_id),
        )


# --- fingerprint --------------------------------------------------------------


def _art_fp(generated: bool, generated_at: datetime | None) -> str:
    return f"{generated}:{generated_at.isoformat() if generated_at else '-'}"


def _compute_hash(analysis: AnalysisResult, artifacts: _ArtifactState) -> str:
    """Fingerprint every input that can change the pack.

    The analysis JSON captures all facts/enrichment/ratings/vulns/tool-runs (so on-demand tool runs
    that keep the same commit still invalidate); the artifact fingerprints capture on-demand
    visualization regenerations.
    """
    payload = analysis.model_dump_json()
    art = "|".join(
        _art_fp(a.generated, a.generated_at)
        for a in (artifacts.graph, artifacts.code_age, artifacts.coupling, artifacts.code_map)
    )
    return hashlib.sha256(f"{payload}||{art}".encode()).hexdigest()


# --- assembly -----------------------------------------------------------------


def _build_pack(
    repo: Repository, a: AnalysisResult, artifacts: _ArtifactState
) -> RepoContextResult:
    e = a.enrichment
    r = e.ratings
    coords = repo.coordinates

    identity = ContextIdentity(
        repository_id=a.repository_id,
        provider=coords.provider.value,
        owner=coords.owner,
        name=coords.name,
        slug=coords.slug,
        url=repo.url.value,
        default_branch=repo.default_branch,
        status=repo.status.value,
        commit_sha=a.commit_sha,
        clone_path=repo.clone_path,
        generated_at=datetime.now(UTC),
    )

    summary = ContextSummary(
        rating_maintainability=r.maintainability.value,
        rating_security=r.security.value,
        rating_health=r.health.value,
        primary_language=a.facts.primary_language,
        loc_total=a.facts.loc_total,
        age_days=a.facts.age_days,
        commit_count=a.facts.commit_count,
        contributor_count=a.facts.contributor_count,
        dependency_count=a.facts.dependency_count,
        has_tests=a.facts.has_tests,
        maintenance_status=e.maintenance_status,
        bus_factor=e.bus_factor,
        open_vulnerabilities=e.vulnerability_count,
        secret_count=e.secret_count,
        health_score=e.health_score,
    )

    metrics = ContextMetrics(
        code_lines=e.code_lines,
        complexity_total=e.complexity_total,
        ccn_average=e.ccn_average,
        ccn_max=e.ccn_max,
        function_count=e.function_count,
        high_complexity_count=e.high_complexity_count,
        maintainability_index=e.maintainability_index,
        cocomo_cost_usd=e.cocomo_cost_usd,
        schedule_months=e.schedule_months,
        test_count=e.test_count,
        test_file_count=e.test_file_count,
        test_to_code_ratio=e.test_to_code_ratio,
        test_coverage_pct=e.test_coverage_pct,
        lint_issue_count=e.lint_issue_count,
        sast_issue_count=e.sast_issue_count,
        dead_code_count=e.dead_code_count,
    )

    top_vulns = sorted(
        a.vulnerabilities, key=lambda v: _SEVERITY_RANK.get(v.severity.upper(), 9)
    )[:_TOP_VULNERABILITIES]
    security = ContextSecurity(
        vulnerability_count=e.vulnerability_count,
        vuln_critical=e.vuln_critical,
        vuln_high=e.vuln_high,
        vuln_moderate=e.vuln_moderate,
        vuln_low=e.vuln_low,
        secret_count=e.secret_count,
        top_vulnerabilities=top_vulns,
        health_score=e.health_score,
        health_checks=a.health_checks,
    )

    top_contributors = sorted(a.contributors, key=lambda c: c.commits, reverse=True)[
        :_TOP_CONTRIBUTORS
    ]
    people = ContextPeople(
        contributor_count=a.facts.contributor_count,
        bus_factor=e.bus_factor,
        top_author_share=e.top_author_share,
        active_contributor_count=e.active_contributor_count,
        top_contributors=top_contributors,
    )

    top_hotspots = sorted(a.hotspots, key=lambda h: h.score, reverse=True)[:_TOP_HOTSPOTS]
    structure = ContextStructure(
        languages=a.languages,
        hotspots=top_hotspots,
        coupling=artifacts.coupling.pairs[:_TOP_COUPLING],
        code_age=artifacts.code_age.cohorts,
        cicd=a.cicd,
        graph_generated=artifacts.graph.generated,
        code_map_generated=artifacts.code_map.generated,
    )

    dependencies = ContextDependencies(
        count=a.facts.dependency_count,
        items=a.dependencies[:_MAX_DEPENDENCIES],
        truncated=len(a.dependencies) > _MAX_DEPENDENCIES,
    )

    tool_coverage = _tool_coverage(a)

    drilldown = ContextDrilldown(
        clone_path=repo.clone_path,
        tools=list(_DRILLDOWN_TOOLS),
        suggested_entry_files=[h.path for h in top_hotspots[:5]],
    )

    return RepoContextResult(
        identity=identity,
        summary=summary,
        facts=a.facts,
        metrics=metrics,
        security=security,
        people=people,
        structure=structure,
        dependencies=dependencies,
        tool_coverage=tool_coverage,
        narrative=None,
        drilldown=drilldown,
    )


def _tool_coverage(a: AnalysisResult) -> ContextToolCoverage:
    contributed: list[str] = []
    ran_no_data: list[str] = []
    unavailable: list[str] = []
    for run in a.tool_runs:
        if not run.available:
            unavailable.append(run.name)
        elif run.contributed:
            contributed.append(run.name)
        else:
            ran_no_data.append(run.name)
    return ContextToolCoverage(
        contributed=sorted(contributed),
        ran_no_data=sorted(ran_no_data),
        unavailable=sorted(unavailable),
    )
