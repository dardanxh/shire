"""Hobits service: config management + the run lifecycle.

`run_hobit` is the engine loop: wake → load context → work (`claude -p`) → parse structured output →
self-score → derive tier → persist run → emit narrative overlay + briefing item. It composes other
services (context, briefing) and the `ClaudeAgent` integration; it never touches another domain's
repository directly (the one exception mirrors ContextService: a cross-domain read for clone_path).
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from hobits.core.exceptions import ConflictError, NotFoundError
from hobits.core.settings import get_settings
from hobits.domain.briefing.domain import derive_tier
from hobits.domain.briefing.services import BriefingService
from hobits.domain.context.services import ContextService
from hobits.domain.hobits.domain import (
    CustomHobit,
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
from hobits.domain.hobits.repo_hobit import RepoHobit
from hobits.domain.hobits.repositories import (
    SqlCustomHobitRepository,
    SqlHobitConfigRepository,
    SqlHobitRunRepository,
    SqlRepositoryHobitRepository,
)
from hobits.domain.hobits.schemas import (
    CreateHobit,
    HobitConfigUpdate,
    HobitResult,
    HobitRunDetailResult,
    HobitRunResult,
    UpdateHobit,
)
from hobits.domain.repository.services import RepositoryService
from hobits.integrations.claude_agent import ClaudeAgent
from hobits.orchestration.schedule_sync import PrefectScheduleSync, validate_cadence

# Neutral self-score used when the agent produced prose but no parseable structured block.
_FALLBACK_SCORE = SelfScore(importance=50, confidence=20, urgency=30)


class HobitService:
    def __init__(self, session: Session, *, agent: ClaudeAgent | None = None) -> None:
        self._session = session
        self._context = ContextService(session)
        self._configs = SqlHobitConfigRepository(session)
        self._custom = SqlCustomHobitRepository(session)
        self._runs = SqlHobitRunRepository(session)
        self._access = SqlRepositoryHobitRepository(session)
        self._briefing = BriefingService(session)
        self._agent_override = agent  # injectable for tests; else built per-run from config

    # --- registry resolution (code roster + user-authored custom hobits) ------
    def _resolve(self, slug: str) -> Hobit | None:
        """A hobit by slug from either source: the code roster or a custom DB row."""
        hobit = get_hobit(slug)
        if hobit is not None:
            return hobit
        custom = self._custom.get(slug)
        return RepoHobit(custom.spec) if custom is not None else None

    def resolve_spec(self, slug: str) -> HobitSpec | None:
        """Public spec lookup across both sources (used by the merge-review module, which runs
        hobits through its own diff-scoped engine and must not hit the repo-assignment gate)."""
        hobit = self._resolve(slug)
        return hobit.spec if hobit is not None else None

    def effective_config_for(self, spec: HobitSpec) -> HobitConfig:
        """Public effective config (spec defaults ⊕ user override) for out-of-domain runners."""
        return self._effective_config(spec)

    def _require_spec(self, slug: str) -> HobitSpec:
        hobit = self._resolve(slug)
        if hobit is None:
            raise NotFoundError(f"Unknown hobit: {slug}")
        return hobit.spec

    def _all_specs(self) -> list[HobitSpec]:
        return all_specs() + [c.spec for c in self._custom.list()]

    # --- per-repo access ------------------------------------------------------
    def list_repo_hobits(self, repository_id: uuid.UUID) -> list[HobitResult]:
        """The hobits assigned to a repository (its allow-list), each with its run cadence."""
        assignments = self._access.assignment_map(repository_id)
        counts = self._briefing.unread_counts()
        customs = {c.spec.slug: c for c in self._custom.list()}
        return [
            self._to_result(
                spec,
                counts.get(spec.slug, 0),
                assignment=assignments[spec.slug],
                custom=customs.get(spec.slug),
            )
            for spec in self._all_specs()
            if spec.slug in assignments
        ]

    def set_repo_hobits(self, repository_id: uuid.UUID, slugs: list[str]) -> list[HobitResult]:
        """Replace a repository's assigned hobits (validated against the registry)."""
        valid = {s for s in slugs if self._resolve(s) is not None}
        self._access.set_all(repository_id, valid)
        # Converge Prefect: unassigned hobits lose their deployment, retained ones keep theirs.
        PrefectScheduleSync(self._session).sync_repo(repository_id)
        return self.list_repo_hobits(repository_id)

    def set_cadence(self, repository_id: uuid.UUID, slug: str, cadence: str) -> list[HobitResult]:
        """Set one assignment's run cadence and reconcile its Prefect deployment."""
        self._require_spec(slug)
        try:
            validate_cadence(cadence)
        except ValueError as exc:
            raise ConflictError(str(exc)) from exc
        if not self._access.set_cadence(repository_id, slug, cadence):
            raise ConflictError(f"Hobit '{slug}' is not assigned to this repository.")
        PrefectScheduleSync(self._session).sync_assignment(repository_id, slug, cadence)
        return self.list_repo_hobits(repository_id)

    # --- config / listing -----------------------------------------------------
    def list_hobits(self) -> list[HobitResult]:
        counts = self._briefing.unread_counts()
        customs = {c.spec.slug: c for c in self._custom.list()}
        return [
            self._to_result(spec, counts.get(spec.slug, 0), custom=customs.get(spec.slug))
            for spec in self._all_specs()
        ]

    def get_hobit_result(self, slug: str) -> HobitResult:
        spec = self._require_spec(slug)
        return self._to_result(
            spec, self._briefing.unread_count(slug), custom=self._custom.get(slug)
        )

    def update_config(self, slug: str, update: HobitConfigUpdate) -> HobitResult:
        custom = self._custom.get(slug)
        if custom is not None:
            # A custom hobit stores its config in-row; keep its identity, replace the config fields.
            self._custom.upsert(
                CustomHobit(
                    spec=HobitSpec(
                        slug=slug,
                        name=custom.spec.name,
                        description=custom.spec.description,
                        category=custom.spec.category,
                        default_charter=update.charter,
                        default_instructions=update.instructions,
                        default_model=update.model,
                        default_timeout_seconds=update.timeout_seconds,
                        default_tags=update.tags,
                    ),
                    enabled=update.enabled,
                    created_at=custom.created_at,
                    updated_at=custom.updated_at,
                )
            )
            return self.get_hobit_result(slug)
        self._require_spec(slug)  # built-in: 404 if unknown, else store an override
        self._configs.upsert(
            slug,
            enabled=update.enabled,
            model=update.model,
            charter=update.charter,
            instructions=update.instructions,
            timeout_seconds=update.timeout_seconds,
            tags=update.tags,
        )
        return self.get_hobit_result(slug)

    # --- custom hobit CRUD ----------------------------------------------------
    def create_hobit(self, data: CreateHobit) -> HobitResult:
        """Create a user-authored hobit. The slug is derived from the name and made unique."""
        slug = self._new_slug(data.name)
        self._custom.upsert(
            CustomHobit(
                spec=self._spec_from(slug, data),
                enabled=data.enabled,
                created_at=None,
                updated_at=None,
            )
        )
        return self.get_hobit_result(slug)

    def update_hobit(self, slug: str, data: UpdateHobit) -> HobitResult:
        """Fully edit a custom hobit (identity + config). Built-in hobits aren't editable here."""
        custom = self._custom.get(slug)
        if custom is None:
            if get_hobit(slug) is not None:
                raise ConflictError(
                    "Built-in hobits can't be edited — adjust their config instead."
                )
            raise NotFoundError(f"Unknown hobit: {slug}")
        self._custom.upsert(
            CustomHobit(
                spec=self._spec_from(slug, data),
                enabled=data.enabled,
                created_at=custom.created_at,
                updated_at=custom.updated_at,
            )
        )
        return self.get_hobit_result(slug)

    def delete_hobit(self, slug: str) -> None:
        """Delete a custom hobit and everything tied to it (runs, briefing items, assignments,
        config override). Built-in hobits can't be deleted — disable them instead."""
        if self._custom.get(slug) is None:
            if get_hobit(slug) is not None:
                raise ConflictError("Built-in hobits can't be deleted — disable them instead.")
            raise NotFoundError(f"Unknown hobit: {slug}")
        self._runs.delete_for_hobit(slug)  # briefing items cascade via FK
        self._access.remove_hobit(slug)
        self._configs.delete(slug)
        self._custom.delete(slug)

    def list_runs(self, repository_id: uuid.UUID) -> list[HobitRunResult]:
        return [HobitRunResult.of(r) for r in self._runs.list_for_repository(repository_id)]

    def list_hobit_runs(self, slug: str) -> list[HobitRunResult]:
        self._require_spec(slug)
        return [HobitRunResult.of(r) for r in self._runs.list_for_hobit(slug)]

    def get_run(self, run_id: uuid.UUID) -> HobitRunDetailResult:
        record = self._runs.get(run_id)
        if record is None:
            raise NotFoundError("Hobit run not found")
        return HobitRunDetailResult.of_detail(record)

    # --- the run lifecycle ----------------------------------------------------
    def run_hobit(
        self, repository_id: uuid.UUID, slug: str, *, trigger: str = "manual"
    ) -> HobitRunResult:
        hobit = self._resolve(slug)
        if hobit is None:
            raise NotFoundError(f"Unknown hobit: {slug}")
        # Access gate: Foundational hobits (repo-onboarding) are always allowed; others must be
        # assigned to the repository.
        if hobit.spec.category != "Foundational" and slug not in self._access.linked_slugs(
            repository_id
        ):
            raise ConflictError(f"Hobit '{slug}' is not assigned to this repository.")
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
                    repository_id,
                    slug,
                    HobitRunStatus.agent_unavailable,
                    pack.identity.commit_sha,
                    started=started,
                    error="The `claude` CLI is not available on the server.",
                    trigger=trigger,
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
        record = self._interpret(hobit, agent_run, repository_id, slug, pack, started, trigger)
        return self._finish(record, writes_narrative=hobit.spec.writes_narrative)

    def run_if_stale(
        self, repository_id: uuid.UUID, slug: str, *, force: bool = False
    ) -> HobitRunResult:
        """The scheduled entry point: run the hobit only IF the repo moved since its last result.

        Cheap change gate — compare the remote's current HEAD (a network-only `ls-remote`) to the
        commit the hobit last produced a result on. Unchanged → record a `skipped_unchanged` run
        and spend no tokens. Changed (or `force`, or the remote is unreachable) → refresh the
        substrate to the new commit, then run the hobit normally. Either way, stamp the assignment's
        `last_checked_at`. This is the "deterministic-first, LLM-on-deltas" gate from NFR #1.
        """
        hobit = self._resolve(slug)
        if hobit is None:
            raise NotFoundError(f"Unknown hobit: {slug}")

        repos = RepositoryService(self._session)
        remote_sha = repos.remote_head(repository_id)
        last = self._runs.latest_result_for(repository_id, slug)
        unchanged = (
            not force
            and remote_sha is not None
            and last is not None
            and last.commit_sha == remote_sha
        )

        self._access.mark_checked(repository_id, slug)
        if unchanged:
            record = _run_record(
                repository_id,
                slug,
                HobitRunStatus.skipped_unchanged,
                remote_sha,
                started=datetime.now(UTC),
                trigger="scheduled",
            )
            self._runs.add(record)
            return HobitRunResult.of(record)

        # The repo moved (or we couldn't tell): bring the substrate up to the new commit so the
        # hobit reasons over fresh context, then run it.
        repos.refresh(repository_id)
        return self.run_hobit(repository_id, slug, trigger="scheduled")

    # --- internals ------------------------------------------------------------
    def _interpret(
        self,
        hobit: Hobit,
        agent_run,
        repository_id: uuid.UUID,
        slug: str,
        pack,
        started: datetime,
        trigger: str = "manual",
    ) -> HobitRunRecord:
        commit = pack.identity.commit_sha
        if not agent_run.ok:
            status = (
                HobitRunStatus.timeout
                if agent_run.error and "timed out" in agent_run.error
                else HobitRunStatus.error
            )
            return _run_record(
                repository_id,
                slug,
                status,
                commit,
                started=started,
                error=agent_run.error,
                raw_output=agent_run.raw_stdout or None,
                duration=agent_run.duration_seconds,
                trigger=trigger,
            )

        output = hobit.parse_output(agent_run.text)
        if output is None:
            # Keep the prose so the human still gets value; neutral score → quiet briefing item.
            headline = f"Onboarding notes for {pack.identity.slug} (needs review)"
            score = _FALLBACK_SCORE
            tier = derive_tier(score.importance, score.confidence, score.urgency).value
            return _run_record(
                repository_id,
                slug,
                HobitRunStatus.parse_failed,
                commit,
                started=started,
                headline=headline,
                narrative=agent_run.text or None,
                score=score,
                tier=tier,
                raw_output=agent_run.raw_stdout or None,
                duration=agent_run.duration_seconds,
                error="Could not parse the hobit's structured output.",
                trigger=trigger,
            )

        tier = derive_tier(
            output.self_score.importance, output.self_score.confidence, output.self_score.urgency
        ).value
        return _run_record(
            repository_id,
            slug,
            HobitRunStatus.completed,
            commit,
            started=started,
            headline=output.headline,
            narrative=output.narrative,
            score=output.self_score,
            tier=tier,
            raw_output=agent_run.raw_stdout or None,
            duration=agent_run.duration_seconds,
            trigger=trigger,
        )

    def _finish(self, record: HobitRunRecord, *, writes_narrative: bool) -> HobitRunResult:
        """Persist the run and emit its overlays: a briefing post always; the context-pack
        narrative only for hobits that own it (onboarding)."""
        self._runs.add(record)
        if writes_narrative and record.narrative is not None:
            self._context.set_narrative(record.repository_id, record.narrative)
        self._briefing.create_from_run(record)  # no-op for unscored runs
        return HobitRunResult.of(record)

    def _effective_config(self, spec: HobitSpec, custom: CustomHobit | None = None) -> HobitConfig:
        custom = custom if custom is not None else self._custom.get(spec.slug)
        if custom is not None:
            # A custom hobit's spec already holds its live config; enabled lives on the record.
            return HobitConfig(
                slug=spec.slug,
                enabled=custom.enabled,
                model=spec.default_model,
                charter=spec.default_charter,
                instructions=spec.default_instructions,
                tags=spec.default_tags,
                timeout_seconds=spec.default_timeout_seconds,
            )
        return _merge_config(spec, self._configs.get(spec.slug))

    def _spec_from(self, slug: str, data: CreateHobit) -> HobitSpec:
        return HobitSpec(
            slug=slug,
            name=data.name,
            description=data.description,
            category=data.category,
            default_charter=data.charter,
            default_instructions=data.instructions,
            default_model=data.model,
            default_timeout_seconds=data.timeout_seconds,
            default_tags=data.tags,
        )

    def _new_slug(self, name: str) -> str:
        """A URL-safe slug from the name, unique across the code roster and custom hobits."""
        base = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-") or "hobit"
        taken = self._custom.slugs()
        candidate, n = base, 2
        while get_hobit(candidate) is not None or candidate in taken:
            candidate, n = f"{base}-{n}", n + 1
        return candidate

    def _to_result(
        self,
        spec: HobitSpec,
        unread_count: int,
        assignment: tuple[str, datetime | None] | None = None,
        custom: CustomHobit | None = None,
    ) -> HobitResult:
        config = self._effective_config(spec, custom)
        latest = self._runs.latest_for_hobit(spec.slug)
        last = HobitRunResult.of(latest) if latest else None
        cadence, last_checked_at = assignment if assignment is not None else (None, None)
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
            tags=config.tags,
            unread_count=unread_count,
            last_run=last,
            cadence=cadence,
            last_checked_at=last_checked_at,
            custom=custom is not None,
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
        tags=(override.tags if override and override.tags is not None else spec.default_tags),
    )


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
    trigger: str = "manual",
) -> HobitRunRecord:
    return HobitRunRecord(
        id=uuid.uuid4(),
        repository_id=repository_id,
        hobit_slug=slug,
        status=status.value,
        trigger=trigger,
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
