"""Hobits service: config management + the run lifecycle.

`run_hobit` is now non-blocking: wake → load context → build the prompt → persist a `queued` run →
enqueue an engine job. The completion handler (jobs.py) parses the structured output, self-scores,
derives the tier, settles the run, and emits the narrative overlay + briefing item. The service
never touches another domain's repository directly (the one exception mirrors ContextService: a
cross-domain read for clone_path).
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from shire.core.exceptions import ConflictError, NotFoundError
from shire.domain.briefing.services import BriefingService
from shire.domain.context.services import ContextService
from shire.domain.hobits.domain import (
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
from shire.domain.hobits.registry import all_specs, get_hobit
from shire.domain.hobits.repo_hobit import RepoHobit
from shire.domain.hobits.repositories import (
    SqlCustomHobitRepository,
    SqlHobitConfigRepository,
    SqlHobitFeedbackRepository,
    SqlHobitGuidanceRepository,
    SqlHobitRunRepository,
    SqlRemovedHobitRepository,
    SqlRepositoryHobitRepository,
)
from shire.domain.hobits.schemas import (
    CreateHobit,
    HobitAssignmentResult,
    HobitConfigUpdate,
    HobitGuidanceResult,
    HobitResult,
    HobitRunDetailResult,
    HobitRunFeedbackResult,
    HobitRunResult,
    UpdateHobit,
    UpsertHobitRunFeedback,
)
from shire.domain.jobs import kinds as job_kinds
from shire.domain.jobs.services import JobService
from shire.domain.repository.services import RepositoryService
from shire.orchestration.schedule_sync import PrefectScheduleSync, validate_cadence

# The feedback cycle: how many raw entries ride along in each run prompt, when accumulated
# feedback triggers a distillation job, and how much of it the distiller reads.
_RAW_FEEDBACK_LIMIT = 5
_DISTILL_THRESHOLD = 3
_DISTILL_DEBOUNCE_SECONDS = 900
_DISTILL_INPUT_LIMIT = 25

# Statuses whose runs produced a response the user can rate.
_RATABLE_STATUSES = (HobitRunStatus.completed.value, HobitRunStatus.parse_failed.value)

# Hobits with a dedicated button in the repository view (CI/CD tab, Branches tab) are always
# runnable ad hoc — requiring an assignment first would break that button.
ALWAYS_AVAILABLE_SLUGS = frozenset({"repo-onboarding", "ci-cd", "git-branching"})

# The branching hobit reasons about branch lifetimes and drift, which the platform already
# measures; the numbers ride along in its prompt so it explains evidence instead of re-deriving it.
_BRANCH_CONTEXT_SLUG = "git-branching"
_BRANCH_CONTEXT_LIMIT = 25


class HobitService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._context = ContextService(session)
        self._configs = SqlHobitConfigRepository(session)
        self._custom = SqlCustomHobitRepository(session)
        self._runs = SqlHobitRunRepository(session)
        self._access = SqlRepositoryHobitRepository(session)
        self._briefing = BriefingService(session)
        self._feedback = SqlHobitFeedbackRepository(session)
        self._guidance = SqlHobitGuidanceRepository(session)
        self._removed = SqlRemovedHobitRepository(session)
        self._removed_cache: set[str] | None = None

    # --- registry resolution (code roster + user-authored custom hobits) ------
    def _removed_slugs(self) -> set[str]:
        """Deleted built-in slugs, loaded once per service instance."""
        if self._removed_cache is None:
            self._removed_cache = self._removed.slugs()
        return self._removed_cache

    def _resolve(self, slug: str) -> Hobit | None:
        """A hobit by slug from either source: the code roster or a custom DB row. Deleted
        built-ins resolve to None everywhere — their roster spec is tombstoned."""
        if slug in self._removed_slugs():
            return None
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

    def resolve_hobit(self, slug: str) -> Hobit | None:
        """Public full-hobit lookup (spec + prompt/parse logic) for the jobs completion handler."""
        return self._resolve(slug)

    def effective_config_for(self, spec: HobitSpec) -> HobitConfig:
        """Public effective config (spec defaults ⊕ user override) for out-of-domain runners."""
        return self._effective_config(spec)

    def _require_spec(self, slug: str) -> HobitSpec:
        hobit = self._resolve(slug)
        if hobit is None:
            raise NotFoundError(f"Unknown hobit: {slug}")
        return hobit.spec

    def _all_specs(self) -> list[HobitSpec]:
        removed = self._removed_slugs()
        return [s for s in all_specs() if s.slug not in removed] + [
            c.spec for c in self._custom.list()
        ]

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
        repo_counts = self._access.assignment_counts()
        return [
            self._to_result(
                spec,
                counts.get(spec.slug, 0),
                custom=customs.get(spec.slug),
                repo_counts=repo_counts.get(spec.slug, (0, 0)),
            )
            for spec in self._all_specs()
        ]

    def get_hobit_result(self, slug: str) -> HobitResult:
        spec = self._require_spec(slug)
        return self._to_result(
            spec,
            self._briefing.unread_count(slug),
            custom=self._custom.get(slug),
            repo_counts=self._access.assignment_counts().get(slug, (0, 0)),
        )

    def list_assignments(self, slug: str) -> list[HobitAssignmentResult]:
        """The repositories this hobit is assigned to, each with its run schedule."""
        self._require_spec(slug)
        return [
            HobitAssignmentResult(
                repository_id=repo_id,
                repository_slug=repo_slug,
                cadence=cadence,
                last_checked_at=last_checked,
            )
            for repo_id, repo_slug, cadence, last_checked in self._access.assignments_for_hobit(
                slug
            )
        ]

    def update_config(self, slug: str, update: HobitConfigUpdate) -> HobitResult:
        custom = self._custom.get(slug)
        if custom is not None:
            # A custom hobit stores its config in-row; keep its identity, replace the config fields.
            self._custom.upsert(
                CustomHobit(
                    spec=HobitSpec(
                        slug=slug,
                        name=update.name,
                        description=custom.spec.description,
                        default_charter=update.charter,
                        default_instructions=update.instructions,
                        default_model=update.model,
                        default_timeout_seconds=update.timeout_seconds,
                        default_tags=update.tags,
                    ),
                    created_at=custom.created_at,
                    updated_at=custom.updated_at,
                )
            )
            return self.get_hobit_result(slug)
        self._require_spec(slug)  # built-in: 404 if unknown, else store an override
        self._configs.upsert(
            slug,
            name=update.name,
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
                created_at=custom.created_at,
                updated_at=custom.updated_at,
            )
        )
        return self.get_hobit_result(slug)

    def delete_hobit(self, slug: str) -> None:
        """Delete a hobit and everything tied to it (runs, briefing items, assignments, config
        override). A custom hobit's row is dropped; a built-in gets a tombstone so its code-roster
        spec stays hidden. Only the foundational onboarding hobit is protected — the ingest flow
        depends on it."""
        if slug == "repo-onboarding":
            raise ConflictError("The onboarding hobit can't be deleted.")
        custom = self._custom.get(slug)
        if custom is None and self._resolve(slug) is None:
            raise NotFoundError(f"Unknown hobit: {slug}")
        self._runs.delete_for_hobit(slug)  # briefing items + feedback cascade via FK
        self._access.remove_hobit(slug)
        self._configs.delete(slug)
        self._guidance.delete(slug)
        if custom is not None:
            self._custom.delete(slug)
        else:
            self._removed.add(slug)
            self._removed_cache = None

    def list_runs(self, repository_id: uuid.UUID) -> list[HobitRunResult]:
        return [HobitRunResult.of(r) for r in self._runs.list_for_repository(repository_id)]

    def list_hobit_runs(self, slug: str) -> list[HobitRunResult]:
        self._require_spec(slug)
        return [HobitRunResult.of(r) for r in self._runs.list_for_hobit(slug)]

    def get_run(self, run_id: uuid.UUID) -> HobitRunDetailResult:
        record = self._runs.get(run_id)
        if record is None:
            raise NotFoundError("Hobit run not found")
        return HobitRunDetailResult.of_detail(record, feedback=self._feedback.get(run_id))

    # --- the feedback cycle ---------------------------------------------------
    def upsert_feedback(
        self, repository_id: uuid.UUID, run_id: uuid.UUID, data: UpsertHobitRunFeedback
    ) -> HobitRunFeedbackResult:
        """Save the user's rating of a run's response, and kick off a distillation when enough
        feedback has accumulated since the last one."""
        run = self._require_repo_run(repository_id, run_id)
        if run.status not in _RATABLE_STATUSES:
            raise ConflictError("Only runs that produced a response can be rated.")
        repo_slug = RepositoryService(self._session).get(repository_id).slug
        record = self._feedback.upsert(
            run_id=run_id,
            hobit_slug=run.hobit_slug,
            repository_slug=repo_slug,
            rating=data.rating,
            comment=data.comment or None,
        )
        self._maybe_enqueue_distill(run.hobit_slug)
        return HobitRunFeedbackResult.of(record)

    def delete_feedback(self, repository_id: uuid.UUID, run_id: uuid.UUID) -> None:
        self._require_repo_run(repository_id, run_id)
        if not self._feedback.delete(run_id):
            raise NotFoundError("This run has no feedback.")

    def get_guidance(self, slug: str) -> HobitGuidanceResult:
        self._require_spec(slug)
        return HobitGuidanceResult.of(slug, self._guidance.get(slug))

    def trigger_distill(self, slug: str) -> HobitGuidanceResult:
        """Force a distillation job now (async — poll the guidance endpoint for the result)."""
        self._require_spec(slug)
        if self._feedback.count_changed_since(slug, None) == 0:
            raise ConflictError("No feedback to distill yet.")
        self._enqueue_distill(slug)
        return self.get_guidance(slug)

    def _require_repo_run(self, repository_id: uuid.UUID, run_id: uuid.UUID) -> HobitRunRecord:
        run = self._runs.get(run_id)
        if run is None or run.repository_id != repository_id:
            raise NotFoundError("Hobit run not found")
        return run

    def _maybe_enqueue_distill(self, slug: str) -> None:
        guidance = self._guidance.get(slug)
        if guidance is not None and guidance.distill_enqueued_at is not None:
            in_flight = (
                guidance.last_distilled_at is None
                or guidance.distill_enqueued_at > guidance.last_distilled_at
            )
            age = (datetime.now(UTC) - guidance.distill_enqueued_at).total_seconds()
            if in_flight and age < _DISTILL_DEBOUNCE_SECONDS:
                return
        since = guidance.last_distilled_at if guidance else None
        if self._feedback.count_changed_since(slug, since) >= _DISTILL_THRESHOLD:
            self._enqueue_distill(slug)

    def _enqueue_distill(self, slug: str) -> None:
        # Local import: jobs.py imports this module for its completion handler.
        from shire.domain.hobits.jobs import build_distill_prompt

        spec = self._require_spec(slug)
        guidance = self._guidance.get(slug)
        entries = self._feedback.recent_entries(slug, _DISTILL_INPUT_LIMIT)
        total = self._feedback.count_changed_since(slug, None)
        jobs = JobService(self._session)
        # Distillation summarizes a handful of ratings — the light tier is plenty.
        model = jobs.light_model()
        jobs.enqueue(
            kind=job_kinds.HOBIT_FEEDBACK_DISTILL,
            title=f"Feedback distillation: {spec.name}",
            prompt=build_distill_prompt(
                spec.name, guidance.guidance if guidance else None, entries
            ),
            payload={
                # No cwd: a prompt-only job — the distiller works entirely from the entries.
                "slug": slug,
                "feedback_count": total,
                "model": model,
                "timeout_seconds": 120.0,
            },
        )
        self._guidance.mark_enqueued(slug)

    # --- the run lifecycle ----------------------------------------------------
    def run_hobit(
        self, repository_id: uuid.UUID, slug: str, *, trigger: str = "manual"
    ) -> HobitRunResult:
        """Validate, persist a `queued` run row, and enqueue the engine job — non-blocking.
        The jobs handler (jobs.py) settles the row and emits the overlays when the job lands."""
        hobit = self._resolve(slug)
        if hobit is None:
            raise NotFoundError(f"Unknown hobit: {slug}")
        # Access gate: hobits with a dedicated home in the repository view are always allowed;
        # others must be assigned to the repository.
        if slug not in ALWAYS_AVAILABLE_SLUGS and slug not in self._access.linked_slugs(
            repository_id
        ):
            raise ConflictError(f"Hobit '{slug}' is not assigned to this repository.")
        config = self._effective_config(hobit.spec)

        # Wake / load context. get_context raises NotFoundError if the repo has no analysis yet.
        pack = self._context.get_context(repository_id)
        if not pack.identity.clone_path:
            raise ConflictError("Repository has no local clone yet.")
        context_md = self._context.get_markdown(repository_id).effective
        if slug == _BRANCH_CONTEXT_SLUG:
            context_md = f"{context_md}\n\n{self._branch_context(repository_id)}"

        # The feedback cycle: distilled standing guidance + the newest raw ratings ride along
        # in the prompt so the hobit tunes itself on what the user said about past responses.
        guidance = self._guidance.get(slug)
        ctx = HobitContext(
            repository_id=repository_id,
            slug=slug,
            repo_slug=pack.identity.slug,
            clone_path=pack.identity.clone_path,
            context_markdown=context_md,
            learned_guidance=guidance.guidance if guidance else None,
            feedback_entries=tuple(self._feedback.recent_entries(slug, _RAW_FEEDBACK_LIMIT)),
        )
        record = HobitRunRecord(
            id=uuid.uuid4(),
            repository_id=repository_id,
            hobit_slug=slug,
            status=HobitRunStatus.queued.value,
            trigger=trigger,
            commit_sha=pack.identity.commit_sha,
            headline=None,
            narrative=None,
            importance=None,
            confidence=None,
            urgency=None,
            tier=None,
            raw_output=None,
            error=None,
            duration_seconds=None,
            started_at=datetime.now(UTC),
            finished_at=None,
        )
        self._runs.add(record)
        JobService(self._session).enqueue(
            kind=job_kinds.HOBIT_RUN,
            title=f"Hobit run: {config.name} — {pack.identity.slug}",
            prompt=hobit.build_prompt(ctx, config.instructions),
            payload={
                "system": config.charter,
                "cwd": ctx.clone_path,
                "model": config.model,
                "timeout_seconds": config.timeout_seconds,
                "run_id": str(record.id),
                "repository_id": str(repository_id),
                "slug": slug,
                "writes_narrative": hobit.spec.writes_narrative,
                "repo_slug": pack.identity.slug,
            },
            repository_id=repository_id,
        )
        return HobitRunResult.of(record)

    def _branch_context(self, repository_id: uuid.UUID) -> str:
        """The live branch inspection as Markdown, for the branching hobit's prompt.

        Cheaper and far more reliable than asking the agent to derive ahead/behind and staleness
        with Grep — it gets the platform's own measurements and spends its run explaining them.
        """
        try:
            branches = RepositoryService(self._session).branches(repository_id)
        except Exception:  # a broken clone must not block the run
            return ""
        lines = [
            "## Branch inspection (measured by the platform)",
            f"- default branch: `{branches.default_branch}`",
            f"- {branches.total_branches} branches total; {branches.merged_count} merged into "
            f"the default branch; {branches.stale_count} untouched for more than "
            f"{branches.stale_days} days",
            "",
            "Most recently active branches:",
        ]
        for branch in branches.branches[:_BRANCH_CONTEXT_LIMIT]:
            drift = ""
            if branch.ahead is not None and branch.behind is not None:
                drift = f", {branch.ahead} ahead / {branch.behind} behind"
            lines.append(
                f"- `{branch.name}` — {branch.status}, last commit "
                f"{branch.last_commit_at:%Y-%m-%d} by {branch.author_name}{drift}"
                f"{' (squash-merged)' if branch.squash_merged else ''}"
            )
        if branches.truncated:
            lines.append("- (branch list truncated)")
        return "\n".join(lines)

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

        # NOTE: the gate is repo-level — for monorepo-focused records (subpath set) a commit
        # anywhere in the repo re-runs the hobit even if the subdirectory didn't change.
        # Over-triggering is safe (never misses a change); scoping it would need a fetch
        # before the gate, defeating the cheap ls-remote design.
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
    def _effective_config(self, spec: HobitSpec, custom: CustomHobit | None = None) -> HobitConfig:
        custom = custom if custom is not None else self._custom.get(spec.slug)
        if custom is not None:
            # A custom hobit's spec already holds its live config.
            return HobitConfig(
                slug=spec.slug,
                name=spec.name,
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
        repo_counts: tuple[int, int] = (0, 0),
    ) -> HobitResult:
        config = self._effective_config(spec, custom)
        latest = self._runs.latest_for_hobit(spec.slug)
        last = HobitRunResult.of(latest) if latest else None
        cadence, last_checked_at = assignment if assignment is not None else (None, None)
        assigned_repos, scheduled_repos = repo_counts
        return HobitResult(
            slug=spec.slug,
            name=config.name,
            description=spec.description,
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
            assigned_repos=assigned_repos,
            scheduled_repos=scheduled_repos,
        )


def _merge_config(spec: HobitSpec, override: HobitConfigOverride | None) -> HobitConfig:
    return HobitConfig(
        slug=spec.slug,
        name=override.name if override and override.name else spec.name,
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
