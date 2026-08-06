"""Business logic for the prompts domain.

Every write that touches a body runs it through `analysis.analyse` and stores the verdict on the
version row, so the score, the token estimate and the findings can never drift from the text they
describe. Bodies are immutable once stored: an edit appends a version and moves the prompt's
`current_version_id`.
"""

from __future__ import annotations

import hashlib
import uuid
from collections.abc import Iterable
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from shire.core.exceptions import ConflictError, NotFoundError, ValidationError
from shire.core.pagination import Page, PaginationParams
from shire.domain.jobs import kinds as job_kinds
from shire.domain.jobs.services import JobService
from shire.domain.prompts import analysis
from shire.domain.prompts.models import (
    PromptJudgementRow,
    PromptReviewRow,
    PromptRow,
    PromptRunRow,
    PromptSuggestionRow,
    PromptVersionRow,
)
from shire.domain.prompts.repositories import (
    SqlPromptArenaRepository,
    SqlPromptRepository,
    SqlPromptReviewRepository,
    SqlPromptSuggestionRepository,
    SqlPromptVersionRepository,
)
from shire.domain.prompts.schemas import (
    ArenaBatchResult,
    CreatePrompt,
    CreatePromptVersion,
    EnqueuedResult,
    PromptDetailResult,
    PromptJudgementResult,
    PromptMetricPoint,
    PromptMetricsResult,
    PromptResult,
    PromptReviewResult,
    PromptRunResult,
    PromptSuggestionResult,
    PromptVersionDetailResult,
    PromptVersionResult,
    RequestSuggestion,
    StartArenaRun,
    UpdatePrompt,
)

# How many trailing version scores the library list carries for its sparkline.
_HISTORY_LIMIT = 20


def _content_hash(body: str) -> str:
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def _total_input_tokens(run: PromptRunRow) -> int | None:
    """The whole input the model saw: uncached + cache-write + cache-read.

    `usage.input_tokens` alone is only the uncached remainder, so on a cached run it reads far
    smaller than the prompt actually is. This mirrors `jobs.schemas.JobUsage.total_tokens`.

    Note this still includes the CLI's own system prompt and tool definitions, not just the user's
    text -- which is why it is reported as "what the call cost", never compared against the
    estimator.
    """
    parts = [
        run.input_tokens,
        run.cache_creation_input_tokens,
        run.cache_read_input_tokens,
    ]
    present = [part for part in parts if part is not None]
    return sum(present) if present else None


def _mean_int(values: Iterable[int | None]) -> int | None:
    """Mean of the values that are actually present, or None if none are.

    Returning None rather than 0 matters for the chart: a version nobody ran is a gap in the line,
    not a version that measured zero tokens.
    """
    present = [value for value in values if value is not None]
    return round(sum(present) / len(present)) if present else None


def _clean_models(models: list[str]) -> list[str]:
    """Trim and de-duplicate while preserving order. Running the same model twice in one batch
    would give the judge two indistinguishable answers to compare."""
    seen: set[str] = set()
    cleaned: list[str] = []
    for model in models:
        trimmed = model.strip()
        if not trimmed or trimmed in seen:
            continue
        seen.add(trimmed)
        cleaned.append(trimmed)
    return cleaned


def _clean_tags(tags: list[str]) -> list[str]:
    """Trim, drop blanks, de-duplicate case-insensitively, cap. Tags are filter chips, so a blank
    one would render as an unclickable empty pill."""
    seen: set[str] = set()
    cleaned: list[str] = []
    for tag in tags:
        trimmed = " ".join(tag.split())
        if not trimmed or trimmed.lower() in seen:
            continue
        seen.add(trimmed.lower())
        cleaned.append(trimmed[:40])
    return cleaned[:20]


class PromptService:
    """Constructed per request from a DB session."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._prompts = SqlPromptRepository(session)
        self._versions = SqlPromptVersionRepository(session)
        self._suggestions = SqlPromptSuggestionRepository(session)
        self._reviews = SqlPromptReviewRepository(session)
        self._arena = SqlPromptArenaRepository(session)

    # --- stateless analysis -------------------------------------------------------
    def analyze(self, body: str) -> analysis.StaticAnalysis:
        """Score a body without persisting anything. Free, instant, no LLM."""
        return analysis.analyse(body)

    # --- prompts ------------------------------------------------------------------
    def create(self, data: CreatePrompt) -> PromptDetailResult:
        now = datetime.now(UTC)
        prompt = PromptRow(
            name=data.name.strip(),
            description=data.description,
            tags=_clean_tags(data.tags),
            created_at=now,
            updated_at=now,
        )
        self._prompts.add(prompt)
        version = self._append_version(
            prompt,
            CreatePromptVersion(
                body=data.body,
                guidance=data.guidance,
                tuning=data.tuning,
                note="Initial version.",
            ),
            now=now,
        )
        return PromptDetailResult.of_detail(
            prompt, current=version, versions=[version], score_history=[version.static_score]
        )

    def list(self, params: PaginationParams) -> Page[PromptResult]:
        rows = self._prompts.list(limit=params.limit, offset=params.offset)
        summaries = self._versions.summaries_for([row.id for row in rows])
        currents = {
            row.current_version_id: self._versions.get(row.current_version_id)
            for row in rows
            if row.current_version_id is not None
        }
        items = [
            PromptResult.of(
                row,
                current=currents.get(row.current_version_id),
                version_count=len(summaries.get(row.id, [])),
                score_history=[score for _, score in summaries.get(row.id, [])][-_HISTORY_LIMIT:],
            )
            for row in rows
        ]
        return Page.create(items, self._prompts.count(), params)

    def get(self, prompt_id: uuid.UUID) -> PromptDetailResult:
        prompt = self._require(prompt_id)
        versions = self._versions.list_for_prompt(prompt_id)
        current = next((v for v in versions if v.id == prompt.current_version_id), None)
        history = [v.static_score for v in reversed(versions)][-_HISTORY_LIMIT:]
        return PromptDetailResult.of_detail(
            prompt,
            current=current,
            versions=versions,
            score_history=history,
            suggestions=(
                self._suggestions.list_for_version(current.id) if current is not None else None
            ),
            reviews=(
                self._reviews.list_for_version(current.id) if current is not None else None
            ),
            batches=(
                self._batches_for_version(current.id) if current is not None else None
            ),
        )

    def update(self, prompt_id: uuid.UUID, data: UpdatePrompt) -> PromptDetailResult:
        prompt = self._require(prompt_id)
        prompt.name = data.name.strip()
        prompt.description = data.description
        prompt.tags = _clean_tags(data.tags)
        prompt.updated_at = datetime.now(UTC)
        return self.get(prompt_id)

    def delete(self, prompt_id: uuid.UUID) -> None:
        self._require(prompt_id)
        self._prompts.delete(prompt_id)

    # --- versions -----------------------------------------------------------------
    def create_version(
        self, prompt_id: uuid.UUID, data: CreatePromptVersion
    ) -> PromptVersionDetailResult:
        prompt = self._require(prompt_id)
        version = self._append_version(prompt, data, now=datetime.now(UTC))
        return PromptVersionDetailResult.of_detail(version)

    def list_versions(self, prompt_id: uuid.UUID) -> list[PromptVersionResult]:
        self._require(prompt_id)
        return [PromptVersionResult.of(row) for row in self._versions.list_for_prompt(prompt_id)]

    def get_version(
        self, prompt_id: uuid.UUID, version_id: uuid.UUID
    ) -> PromptVersionDetailResult:
        version = self._require_version(prompt_id, version_id)
        return PromptVersionDetailResult.of_detail(
            version,
            suggestions=self._suggestions.list_for_version(version.id),
            reviews=self._reviews.list_for_version(version.id),
            batches=self._batches_for_version(version.id),
        )

    def set_current_version(
        self, prompt_id: uuid.UUID, version_id: uuid.UUID
    ) -> PromptDetailResult:
        """Point the prompt back at an earlier version without copying its text forward.

        Useful when a rewrite turns out worse: the history stays intact and the workbench simply
        opens on the version you trust.
        """
        prompt = self._require(prompt_id)
        version = self._require_version(prompt_id, version_id)
        prompt.current_version_id = version.id
        prompt.updated_at = datetime.now(UTC)
        return self.get(prompt_id)

    # --- metrics ------------------------------------------------------------------
    def metrics(self, prompt_id: uuid.UUID) -> PromptMetricsResult:
        """One point per version, oldest first: the deterministic score, the latest AI review, and
        the measured cost of any arena runs.

        Composed in three bulk queries rather than per version -- this endpoint exists to draw a
        chart, and an N+1 across versions would make it the slowest page in the module.
        """
        self._require(prompt_id)
        versions = list(reversed(self._versions.list_for_prompt(prompt_id)))
        version_ids = [version.id for version in versions]
        reviews = self._reviews.latest_done_for_versions(version_ids)
        runs_by_version = self._arena.done_runs_for_versions(version_ids)
        judge_overall = self._arena.judge_overall_for_versions(version_ids)

        points: list[PromptMetricPoint] = []
        for version in versions:
            review = reviews.get(version.id)
            runs = runs_by_version.get(version.id, [])
            # The CLI reports `input_tokens` as the *uncached remainder* only -- the bulk of a
            # prompt lands in the cache counters. Summing all three is the real prompt size; using
            # `input_tokens` alone reported 6 tokens for a 113-token prompt.
            measured_in = _mean_int(
                _total_input_tokens(run)
                for run in runs
            )
            measured_out = _mean_int(run.output_tokens for run in runs)
            costs = [run.total_cost_usd for run in runs if run.total_cost_usd is not None]

            points.append(
                PromptMetricPoint(
                    version_id=version.id,
                    number=version.number,
                    created_at=version.created_at,
                    source=version.source,
                    estimated_input_tokens=version.estimated_input_tokens,
                    static_score=version.static_score,
                    review_model=review.model if review else None,
                    clarity=review.clarity if review else None,
                    specificity=review.specificity if review else None,
                    structure=review.structure if review else None,
                    context_sufficiency=review.context_sufficiency if review else None,
                    factfulness=review.factfulness if review else None,
                    accuracy=review.accuracy if review else None,
                    goal_focus=review.goal_focus if review else None,
                    hallucination_risk=review.hallucination_risk if review else None,
                    measured_input_tokens=measured_in,
                    measured_output_tokens=measured_out,
                    total_cost_usd=(sum(costs) / len(costs)) if costs else None,
                    run_count=len(runs),
                    judge_overall=judge_overall.get(version.id),
                )
            )

        return PromptMetricsResult(prompt_id=prompt_id, points=points)

    # --- arena --------------------------------------------------------------------
    def start_arena_run(
        self, prompt_id: uuid.UUID, version_id: uuid.UUID, data: StartArenaRun
    ) -> list[PromptRunResult]:
        """Run one version against several models at once, one engine job per model.

        Returns the created rows immediately -- the engine settles them, and the last one to settle
        starts the judge (see `jobs._maybe_judge`).
        """
        version = self._require_version(prompt_id, version_id)
        if self._arena.has_unsettled_runs(version_id):
            raise ConflictError("A batch for this version is already running.")

        models = _clean_models(data.models)
        if not models:
            raise ValidationError("Pick at least one model to run against.")
        unknown = [model for model in models if model not in job_kinds.AVAILABLE_MODELS]
        if unknown:
            raise ValidationError(f"Unknown model(s): {', '.join(unknown)}")
        judge_model = data.judge_model or JobService(self._session).engine_defaults()[0]
        if data.judge and judge_model not in job_kinds.AVAILABLE_MODELS:
            raise ValidationError(f"Unknown judge model: {judge_model}")

        from shire.domain.prompts.jobs import (
            NO_TOOLS_DENY_LIST,
            PROMPT_ONLY_TIMEOUT_SECONDS,
            substitute_variables,
        )

        now = datetime.now(UTC)
        batch_id = uuid.uuid4()
        body = substitute_variables(version.body, data.variables)
        jobs = JobService(self._session)
        prompt_name = self._prompts.get(prompt_id).name

        rows: list[PromptRunRow] = []
        for model in models:
            row = PromptRunRow(
                version_id=version.id,
                batch_id=batch_id,
                model=model,
                status="pending",
                system=data.system,
                variables=data.variables,
                created_at=now,
            )
            self._arena.add_run(row)
            job = jobs.enqueue(
                kind=job_kinds.PROMPT_RUN,
                title=f"Prompt run ({model}): {prompt_name}",
                # The prompt under test runs verbatim -- no wrapper, no instructions of ours. Any
                # addition here would mean the arena measures something other than this prompt.
                prompt=body,
                payload={
                    "system": data.system,
                    # Hermetic: the prompt under test must not reach the engine's filesystem, or
                    # the arena measures the container as much as the prompt.
                    "disallowed_tools": list(NO_TOOLS_DENY_LIST),
                    "model": model,
                    "timeout_seconds": PROMPT_ONLY_TIMEOUT_SECONDS,
                    "version_id": str(version.id),
                    "run_id": str(row.id),
                    "batch_id": str(batch_id),
                },
            )
            row.job_id = job.id
            rows.append(row)

        if data.judge:
            # Created up front and left `pending`: the barrier claims it by flipping the status, so
            # only one of N racing run handlers enqueues the judge.
            self._arena.add_judgement(
                PromptJudgementRow(
                    version_id=version.id,
                    batch_id=batch_id,
                    status="pending",
                    model=judge_model,
                    created_at=now,
                )
            )

        return [PromptRunResult.of(row) for row in rows]

    def list_batches(
        self, prompt_id: uuid.UUID, version_id: uuid.UUID
    ) -> list[ArenaBatchResult]:
        self._require_version(prompt_id, version_id)
        return self._batches_for_version(version_id)

    def _batches_for_version(self, version_id: uuid.UUID) -> list[ArenaBatchResult]:
        """Group runs into the batches they were started as, newest batch first."""
        runs = self._arena.runs_for_version(version_id)
        judgements = {
            row.batch_id: row for row in self._arena.judgements_for_version(version_id)
        }
        grouped: dict[uuid.UUID, list[PromptRunRow]] = {}
        for run in runs:
            grouped.setdefault(run.batch_id, []).append(run)
        return [
            ArenaBatchResult(
                batch_id=batch_id,
                runs=[PromptRunResult.of(run) for run in batch_runs],
                judgement=(
                    PromptJudgementResult.of(judgements[batch_id])
                    if batch_id in judgements
                    else None
                ),
                created_at=min(run.created_at for run in batch_runs),
            )
            for batch_id, batch_runs in grouped.items()
        ]

    # --- AI review ----------------------------------------------------------------
    def request_review(self, prompt_id: uuid.UUID, version_id: uuid.UUID) -> EnqueuedResult:
        """Ask the model to score a version. Returns immediately; the job settles the row."""
        version = self._require_version(prompt_id, version_id)
        if self._reviews.has_unsettled(version_id):
            raise ConflictError("A review of this version is already in flight.")

        jobs = JobService(self._session)
        model, _timeout = jobs.engine_defaults()
        row = PromptReviewRow(
            version_id=version.id,
            status="pending",
            model=model,
            created_at=datetime.now(UTC),
        )
        self._reviews.add(row)

        from shire.domain.prompts.jobs import (
            PROMPT_ONLY_TIMEOUT_SECONDS,
            build_review_prompt,
        )

        job = jobs.enqueue(
            kind=job_kinds.PROMPT_REVIEW,
            title=f"Prompt review: {self._prompts.get(prompt_id).name}",
            prompt=build_review_prompt(version),
            payload={
                "model": model,
                "timeout_seconds": PROMPT_ONLY_TIMEOUT_SECONDS,
                "prompt_id": str(prompt_id),
                "version_id": str(version.id),
                "review_id": str(row.id),
            },
        )
        row.job_id = job.id
        return EnqueuedResult(job_id=job.id, artefact_id=row.id)

    def list_reviews(
        self, prompt_id: uuid.UUID, version_id: uuid.UUID
    ) -> list[PromptReviewResult]:
        self._require_version(prompt_id, version_id)
        return [
            PromptReviewResult.of(row) for row in self._reviews.list_for_version(version_id)
        ]

    # --- AI suggestions -----------------------------------------------------------
    def request_suggestion(
        self, prompt_id: uuid.UUID, version_id: uuid.UUID, data: RequestSuggestion
    ) -> EnqueuedResult:
        """Ask the model to rewrite a version. Returns immediately; the job settles the row.

        The requested tuning and guidance are written onto the version first, so the prompt the
        engine sees and the knobs the user set can never disagree -- and so the next save carries
        the intent that produced it.
        """
        version = self._require_version(prompt_id, version_id)
        if self._suggestions.has_unsettled(version_id):
            raise ConflictError("A suggestion for this version is already in flight.")

        version.tuning = data.tuning.model_dump(mode="json")
        if data.guidance is not None:
            version.guidance = data.guidance
        self._session.flush()

        jobs = JobService(self._session)
        model, _timeout = jobs.engine_defaults()
        row = PromptSuggestionRow(
            version_id=version.id,
            status="pending",
            model=model,
            created_at=datetime.now(UTC),
        )
        self._suggestions.add(row)

        # Deferred import: jobs.py imports this module's models, and building the prompt needs the
        # freshly-written tuning.
        from shire.domain.prompts.jobs import (
            PROMPT_ONLY_TIMEOUT_SECONDS,
            build_suggest_prompt,
        )

        job = jobs.enqueue(
            kind=job_kinds.PROMPT_SUGGEST,
            title=f"Prompt rewrite: {self._prompts.get(prompt_id).name}",
            prompt=build_suggest_prompt(version),
            payload={
                # Prompt-only: no cwd. `allowed_tools` is deliberately absent -- an empty list
                # would read as *unrestricted* to the CLI (no --allowedTools flag permits every
                # tool), so the engine's read-only default is the safer floor. The prompt itself
                # tells the model not to use tools; see prompts/jobs.py.
                "model": model,
                "timeout_seconds": PROMPT_ONLY_TIMEOUT_SECONDS,
                "prompt_id": str(prompt_id),
                "version_id": str(version.id),
                "suggestion_id": str(row.id),
            },
        )
        row.job_id = job.id
        return EnqueuedResult(job_id=job.id, artefact_id=row.id)

    def list_suggestions(
        self, prompt_id: uuid.UUID, version_id: uuid.UUID
    ) -> list[PromptSuggestionResult]:
        self._require_version(prompt_id, version_id)
        return [
            PromptSuggestionResult.of(row)
            for row in self._suggestions.list_for_version(version_id)
        ]

    # --- internals ----------------------------------------------------------------
    def _append_version(
        self, prompt: PromptRow, data: CreatePromptVersion, *, now: datetime
    ) -> PromptVersionRow:
        body = data.body.strip()
        if not body:
            raise ValidationError("A prompt cannot be blank")

        content_hash = _content_hash(body)
        current = (
            self._versions.get(prompt.current_version_id)
            if prompt.current_version_id is not None
            else None
        )
        # Refuse a no-op: an identical body would add a version whose metrics are, by definition,
        # unchanged, which is exactly the noise the trend chart must not contain.
        if current is not None and current.content_hash == content_hash:
            raise ConflictError("This is identical to the current version.")

        verdict = analysis.analyse(body)
        version = PromptVersionRow(
            prompt_id=prompt.id,
            number=self._versions.next_number(prompt.id),
            body=body,
            guidance=data.guidance,
            tuning=data.tuning.model_dump(mode="json"),
            source=data.source.value,
            content_hash=content_hash,
            estimated_input_tokens=verdict.estimated_input_tokens,
            static_score=verdict.score,
            static_findings=[f.model_dump(mode="json") for f in verdict.findings],
            note=data.note,
            from_suggestion_id=data.from_suggestion_id,
            created_at=now,
        )
        self._versions.add(version)
        prompt.current_version_id = version.id
        prompt.updated_at = now
        return version

    def _require(self, prompt_id: uuid.UUID) -> PromptRow:
        row = self._prompts.get(prompt_id)
        if row is None:
            raise NotFoundError("Prompt not found")
        return row

    def _require_version(self, prompt_id: uuid.UUID, version_id: uuid.UUID) -> PromptVersionRow:
        row = self._versions.get(version_id)
        if row is None or row.prompt_id != prompt_id:
            raise NotFoundError("Prompt version not found")
        return row
