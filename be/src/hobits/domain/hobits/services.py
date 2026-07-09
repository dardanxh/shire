"""Hobits service: config management + the run lifecycle.

`run_hobit` is the engine loop: wake → load context → work (`claude -p`) → parse structured output →
self-score → derive tier → persist run → emit narrative overlay + briefing item. It composes other
services (context, briefing) and the `ClaudeAgent` integration; it never touches another domain's
repository directly (the one exception mirrors ContextService: a cross-domain read for clone_path).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from hobits.core.exceptions import ConflictError, NotFoundError
from hobits.core.settings import get_settings
from hobits.domain.briefing.domain import derive_tier
from hobits.domain.briefing.services import BriefingService
from hobits.domain.context.services import ContextService
from hobits.domain.hobits.domain import (
    Hobit,
    HobitConfig,
    HobitConfigOverride,
    HobitContext,
    HobitRunRecord,
    HobitRunStatus,
    HobitSpec,
    SelfScore,
)
from hobits.domain.hobits.registry import all_specs, get_hobit
from hobits.domain.hobits.repositories import (
    SqlHobitConfigRepository,
    SqlHobitRunRepository,
)
from hobits.domain.hobits.schemas import (
    HobitConfigUpdate,
    HobitResult,
    HobitRunDetailResult,
    HobitRunResult,
)
from hobits.integrations.claude_agent import ClaudeAgent

# Neutral self-score used when the agent produced prose but no parseable structured block.
_FALLBACK_SCORE = SelfScore(importance=50, confidence=20, urgency=30)


class HobitService:
    def __init__(self, session: Session, *, agent: ClaudeAgent | None = None) -> None:
        self._context = ContextService(session)
        self._configs = SqlHobitConfigRepository(session)
        self._runs = SqlHobitRunRepository(session)
        self._briefing = BriefingService(session)
        self._agent_override = agent  # injectable for tests; else built per-run from config

    # --- config / listing -----------------------------------------------------
    def list_hobits(self) -> list[HobitResult]:
        counts = self._briefing.unread_counts()
        return [self._to_result(spec, counts.get(spec.slug, 0)) for spec in all_specs()]

    def get_hobit_result(self, slug: str) -> HobitResult:
        spec = _require_spec(slug)
        return self._to_result(spec, self._briefing.unread_count(slug))

    def update_config(self, slug: str, update: HobitConfigUpdate) -> HobitResult:
        _require_spec(slug)
        self._configs.upsert(
            slug,
            enabled=update.enabled,
            model=update.model,
            charter=update.charter,
            instructions=update.instructions,
            timeout_seconds=update.timeout_seconds,
        )
        return self.get_hobit_result(slug)

    def list_runs(self, repository_id: uuid.UUID) -> list[HobitRunResult]:
        return [HobitRunResult.of(r) for r in self._runs.list_for_repository(repository_id)]

    def list_hobit_runs(self, slug: str) -> list[HobitRunResult]:
        _require_spec(slug)
        return [HobitRunResult.of(r) for r in self._runs.list_for_hobit(slug)]

    def get_run(self, run_id: uuid.UUID) -> HobitRunDetailResult:
        record = self._runs.get(run_id)
        if record is None:
            raise NotFoundError("Hobit run not found")
        return HobitRunDetailResult.of_detail(record)

    # --- the run lifecycle ----------------------------------------------------
    def run_hobit(self, repository_id: uuid.UUID, slug: str) -> HobitRunResult:
        hobit = get_hobit(slug)
        if hobit is None:
            raise NotFoundError(f"Unknown hobit: {slug}")
        config = self._effective_config(hobit.spec)
        if not config.enabled:
            raise ConflictError(f"Hobit '{slug}' is disabled.")

        # Wake / load context. get_context raises NotFoundError if the repo has no analysis yet.
        pack = self._context.get_context(repository_id)
        if not pack.identity.clone_path:
            raise ConflictError("Repository has no local clone yet.")
        context_md = self._context.get_markdown(repository_id).effective

        agent = self._agent_override or ClaudeAgent(
            binary=get_settings().claude_binary,
            model=config.model,
            timeout_seconds=config.timeout_seconds,
        )
        started = datetime.now(UTC)

        if self._agent_override is None and not agent.available():
            return self._finish(
                _run_record(
                    repository_id, slug, HobitRunStatus.agent_unavailable, pack.identity.commit_sha,
                    started=started, error="The `claude` CLI is not available on the server.",
                ),
                writes_narrative=hobit.spec.writes_narrative,
            )

        ctx = HobitContext(
            repository_id=repository_id,
            slug=slug,
            repo_slug=pack.identity.slug,
            clone_path=pack.identity.clone_path,
            context_markdown=context_md,
        )
        agent_run = agent.run(
            hobit.build_prompt(ctx, config.instructions),
            system=config.charter,
            cwd=ctx.clone_path,
        )
        record = self._interpret(hobit, agent_run, repository_id, slug, pack, started)
        return self._finish(record, writes_narrative=hobit.spec.writes_narrative)

    # --- internals ------------------------------------------------------------
    def _interpret(
        self,
        hobit: Hobit,
        agent_run,
        repository_id: uuid.UUID,
        slug: str,
        pack,
        started: datetime,
    ) -> HobitRunRecord:
        commit = pack.identity.commit_sha
        if not agent_run.ok:
            status = (
                HobitRunStatus.timeout
                if agent_run.error and "timed out" in agent_run.error
                else HobitRunStatus.error
            )
            return _run_record(
                repository_id, slug, status, commit, started=started,
                error=agent_run.error, raw_output=agent_run.raw_stdout or None,
                duration=agent_run.duration_seconds,
            )

        output = hobit.parse_output(agent_run.text)
        if output is None:
            # Keep the prose so the human still gets value; neutral score → quiet briefing item.
            headline = f"Onboarding notes for {pack.identity.slug} (needs review)"
            score = _FALLBACK_SCORE
            tier = derive_tier(score.importance, score.confidence, score.urgency).value
            return _run_record(
                repository_id, slug, HobitRunStatus.parse_failed, commit, started=started,
                headline=headline, narrative=agent_run.text or None, score=score, tier=tier,
                raw_output=agent_run.raw_stdout or None, duration=agent_run.duration_seconds,
                error="Could not parse the hobit's structured output.",
            )

        tier = derive_tier(
            output.self_score.importance, output.self_score.confidence, output.self_score.urgency
        ).value
        return _run_record(
            repository_id, slug, HobitRunStatus.completed, commit, started=started,
            headline=output.headline, narrative=output.narrative, score=output.self_score,
            tier=tier, raw_output=agent_run.raw_stdout or None,
            duration=agent_run.duration_seconds,
        )

    def _finish(
        self, record: HobitRunRecord, *, writes_narrative: bool
    ) -> HobitRunResult:
        """Persist the run and emit its overlays: a briefing post always; the context-pack
        narrative only for hobits that own it (onboarding)."""
        self._runs.add(record)
        if writes_narrative and record.narrative is not None:
            self._context.set_narrative(record.repository_id, record.narrative)
        self._briefing.create_from_run(record)  # no-op for unscored runs
        return HobitRunResult.of(record)

    def _effective_config(self, spec: HobitSpec) -> HobitConfig:
        return _merge_config(spec, self._configs.get(spec.slug))

    def _to_result(self, spec: HobitSpec, unread_count: int) -> HobitResult:
        config = self._effective_config(spec)
        latest = self._runs.latest_for_hobit(spec.slug)
        last = HobitRunResult.of(latest) if latest else None
        return HobitResult(
            slug=spec.slug,
            name=spec.name,
            description=spec.description,
            category=spec.category,
            enabled=config.enabled,
            model=config.model,
            charter=config.charter,
            instructions=config.instructions,
            timeout_seconds=config.timeout_seconds,
            unread_count=unread_count,
            last_run=last,
        )


def _merge_config(spec: HobitSpec, override: HobitConfigOverride | None) -> HobitConfig:
    return HobitConfig(
        slug=spec.slug,
        enabled=override.enabled if override and override.enabled is not None else True,
        model=override.model if override and override.model else spec.default_model,
        charter=override.charter if override and override.charter else spec.default_charter,
        instructions=(
            override.instructions
            if override and override.instructions
            else spec.default_instructions
        ),
        timeout_seconds=(
            override.timeout_seconds
            if override and override.timeout_seconds
            else spec.default_timeout_seconds
        ),
    )


def _require_spec(slug: str) -> HobitSpec:
    hobit = get_hobit(slug)
    if hobit is None:
        raise NotFoundError(f"Unknown hobit: {slug}")
    return hobit.spec


def _run_record(
    repository_id: uuid.UUID,
    slug: str,
    status: HobitRunStatus,
    commit_sha: str | None,
    *,
    started: datetime,
    headline: str | None = None,
    narrative: str | None = None,
    score: SelfScore | None = None,
    tier: str | None = None,
    raw_output: str | None = None,
    error: str | None = None,
    duration: float | None = None,
) -> HobitRunRecord:
    return HobitRunRecord(
        id=uuid.uuid4(),
        repository_id=repository_id,
        hobit_slug=slug,
        status=status.value,
        commit_sha=commit_sha,
        headline=headline,
        narrative=narrative,
        importance=score.importance if score else None,
        confidence=score.confidence if score else None,
        urgency=score.urgency if score else None,
        tier=tier,
        raw_output=raw_output,
        error=error,
        duration_seconds=duration,
        started_at=started,
        finished_at=datetime.now(UTC),
    )
