"""The background AI pipeline for a merge review.

Runs on a daemon thread after `create`/`reanalyze` commit. Each stage opens its own short
`unit_of_work()` to persist its result — no session is ever held across an agent call, and a crash
in one stage marks only that section failed. Order: claim → classification → overview → hobit
reviews (sequential — the CLI agent is heavyweight) → deterministic risk score → finalize.
"""

from __future__ import annotations

import logging
import threading
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from hobits.core.db import unit_of_work
from hobits.core.exceptions import NotFoundError
from hobits.core.settings import get_settings
from hobits.domain.context.services import ContextService
from hobits.domain.hobits.domain import HobitConfig
from hobits.domain.hobits.services import HobitService
from hobits.domain.merge_review.domain import Footprint, MrComment, compute_risk
from hobits.domain.merge_review.models import MergeReviewRow
from hobits.domain.merge_review.mr_hobit import (
    MrContext,
    MrHobit,
    build_classification_prompt,
    build_overview_prompt,
    footprint_summary,
    parse_classification,
    parse_overview,
)
from hobits.domain.merge_review.repositories import (
    SqlMergeReviewRepository,
    SqlMrHobitReviewRepository,
)
from hobits.domain.repository.repositories import SqlRepositoryRepository
from hobits.integrations.claude_agent import ClaudeAgent
from hobits.integrations.git_diff import diff_excerpt

logger = logging.getLogger(__name__)

_AI_SECTIONS = ("classification_status", "overview_status", "hobits_status", "risk_status")


@dataclass(frozen=True)
class _PipelineInputs:
    repo_slug: str
    clone_path: str
    source_branch: str
    target_branch: str
    footprint: Footprint
    hobit_configs: list[HobitConfig]  # one per selected slug, resolution order preserved
    context_markdown: str


def dispatch_pipeline(review_id: uuid.UUID) -> None:
    """Fire-and-forget: the caller must have committed the review row first."""
    threading.Thread(
        target=run_pipeline, args=(review_id,), daemon=True, name=f"mr-review-{review_id}"
    ).start()


def run_pipeline(review_id: uuid.UUID) -> None:
    try:
        inputs = _claim_and_load(review_id)
        if inputs is None:
            return  # another pipeline owns the review, or it vanished

        excerpt = diff_excerpt(
            inputs.clone_path,
            inputs.footprint.merge_base_sha,
            inputs.footprint.source_sha,
            inputs.footprint.files,
        )
        ctx = MrContext(
            repo_slug=inputs.repo_slug,
            source_branch=inputs.source_branch,
            target_branch=inputs.target_branch,
            clone_path=inputs.clone_path,
            context_markdown=inputs.context_markdown,
            footprint_summary=footprint_summary(inputs.footprint),
            diff_excerpt=excerpt,
        )

        settings = get_settings()
        default_agent = ClaudeAgent(
            binary=settings.claude_binary,
            model=settings.claude_model,
            timeout_seconds=settings.claude_timeout_seconds,
        )
        if not default_agent.available():
            _fail_all_sections(review_id, "The `claude` CLI is not available on the server.")
            return

        _run_classification(review_id, ctx, default_agent)
        _run_overview(review_id, ctx, default_agent)
        comments = _run_hobit_reviews(review_id, ctx, inputs.hobit_configs, settings)
        _run_risk(review_id, inputs.footprint, comments)
        _finalize(review_id)
    except Exception:
        logger.exception("Merge-review pipeline crashed for %s", review_id)
        _stamp_failure(review_id, "The analysis pipeline crashed — see server logs.")


# --- stages ------------------------------------------------------------------------------------


def _claim_and_load(review_id: uuid.UUID) -> _PipelineInputs | None:
    with unit_of_work() as session:
        if not SqlMergeReviewRepository(session).try_claim(review_id):
            return None
        row = session.get(MergeReviewRow, review_id)
        if row is None or row.footprint is None:
            return None
        repo = SqlRepositoryRepository(session).get(row.repository_id)
        if repo is None or not repo.clone_path:
            return None

        hobits = HobitService(session)
        configs: list[HobitConfig] = []
        for slug in row.selected_hobit_slugs or []:
            spec = hobits.resolve_spec(slug)
            if spec is not None:
                configs.append(hobits.effective_config_for(spec))

        try:
            context_md = ContextService(session).get_markdown(row.repository_id).effective
        except NotFoundError:
            context_md = "(no context pack yet — the repository has no completed analysis)"

        return _PipelineInputs(
            repo_slug=repo.coordinates.slug,
            clone_path=repo.clone_path,
            source_branch=row.source_branch,
            target_branch=row.target_branch,
            footprint=Footprint.model_validate(row.footprint),
            hobit_configs=configs,
            context_markdown=context_md,
        )


def _run_classification(review_id: uuid.UUID, ctx: MrContext, agent: ClaudeAgent) -> None:
    _set_review_fields(review_id, classification_status="running")
    try:
        run = agent.run(build_classification_prompt(ctx), cwd=ctx.clone_path)
        labels = parse_classification(run.text) if run.ok else None
        if labels is None:
            _set_review_fields(
                review_id,
                classification_status="failed",
                error=run.error or "Could not parse the classification output.",
            )
            return
        _set_review_fields(
            review_id,
            classification=[label.model_dump(mode="json") for label in labels],
            classification_status="completed",
        )
    except Exception:
        logger.exception("Classification stage failed for %s", review_id)
        _set_review_fields(review_id, classification_status="failed")


def _run_overview(review_id: uuid.UUID, ctx: MrContext, agent: ClaudeAgent) -> None:
    _set_review_fields(review_id, overview_status="running")
    try:
        run = agent.run(build_overview_prompt(ctx), cwd=ctx.clone_path)
        overview = parse_overview(run.text) if run.ok else None
        if overview is None:
            _set_review_fields(
                review_id,
                overview_status="failed",
                error=run.error or "Could not parse the overview output.",
            )
            return
        _set_review_fields(review_id, overview_markdown=overview, overview_status="completed")
    except Exception:
        logger.exception("Overview stage failed for %s", review_id)
        _set_review_fields(review_id, overview_status="failed")


def _run_hobit_reviews(
    review_id: uuid.UUID, ctx: MrContext, configs: list[HobitConfig], settings
) -> list[MrComment] | None:
    """Sequential per-hobit reviews. Returns every comment from completed reviews, or None when
    no review completed (so the risk formula drops its findings term)."""
    if not configs:
        _set_review_fields(review_id, hobits_status="completed")
        return None

    _set_review_fields(review_id, hobits_status="running")
    all_comments: list[MrComment] = []
    any_completed = False
    for config in configs:
        try:
            comments = _run_one_hobit(review_id, ctx, config, settings)
        except Exception:
            logger.exception("Hobit %s failed for review %s", config.slug, review_id)
            _set_hobit_fields(review_id, config.slug, status="error", finished=True)
            comments = None
        if comments is not None:
            any_completed = True
            all_comments.extend(comments)

    statuses = _hobit_statuses(review_id)
    all_failed = statuses and not any(s == "completed" for s in statuses)
    _set_review_fields(review_id, hobits_status="failed" if all_failed else "completed")
    return all_comments if any_completed else None


def _run_one_hobit(
    review_id: uuid.UUID, ctx: MrContext, config: HobitConfig, settings
) -> list[MrComment] | None:
    """Run one hobit against the diff; persist its row; return its comments when completed."""
    with unit_of_work() as session:
        hobits = HobitService(session)
        spec = hobits.resolve_spec(config.slug)
    if spec is None:  # custom hobit deleted after selection
        _set_hobit_fields(review_id, config.slug, status="error", finished=True)
        return None

    _set_hobit_fields(review_id, config.slug, status="running", started=True)
    hobit = MrHobit(spec)
    agent = ClaudeAgent(
        binary=settings.claude_binary,
        model=config.model,
        timeout_seconds=config.timeout_seconds,
    )
    run = agent.run(
        hobit.build_prompt(ctx, config.instructions), system=config.charter, cwd=ctx.clone_path
    )

    if not run.ok:
        status = "timeout" if run.error and "timed out" in run.error else "error"
        _set_hobit_fields(
            review_id,
            config.slug,
            status=status,
            error=run.error,
            raw_output=run.raw_stdout or None,
            duration=run.duration_seconds,
            finished=True,
        )
        return None

    output = hobit.parse_output(run.text)
    if output is None:
        _set_hobit_fields(
            review_id,
            config.slug,
            status="parse_failed",
            error="Could not parse the hobit's structured output.",
            raw_output=run.raw_stdout or None,
            duration=run.duration_seconds,
            finished=True,
        )
        return None

    for comment in output.comments:
        comment.id = str(uuid.uuid4())  # stable key for the UI
    _set_hobit_fields(
        review_id,
        config.slug,
        status="completed",
        headline=output.headline,
        self_score=output.self_score,
        comments=[c.model_dump(mode="json") for c in output.comments],
        raw_output=run.raw_stdout or None,
        duration=run.duration_seconds,
        finished=True,
    )
    return output.comments


def _run_risk(review_id: uuid.UUID, footprint: Footprint, comments: list[MrComment] | None) -> None:
    _set_review_fields(review_id, risk_status="running")
    try:
        breakdown = compute_risk(footprint, comments)
        _set_review_fields(
            review_id,
            risk_score=breakdown.total,
            risk_verdict=breakdown.verdict.value,
            risk_breakdown=breakdown.model_dump(mode="json"),
            risk_status="completed",
        )
    except Exception:
        logger.exception("Risk stage failed for %s", review_id)
        _set_review_fields(review_id, risk_status="failed")


def _finalize(review_id: uuid.UUID) -> None:
    with unit_of_work() as session:
        row = session.get(MergeReviewRow, review_id)
        if row is None:
            return
        row.overall_status = "completed"
        row.analyzed_at = datetime.now(UTC)
        row.updated_at = datetime.now(UTC)


# --- persistence helpers (each opens its own short transaction) --------------------------------


def _set_review_fields(review_id: uuid.UUID, **fields) -> None:
    with unit_of_work() as session:
        row = session.get(MergeReviewRow, review_id)
        if row is None:
            return
        for key, value in fields.items():
            setattr(row, key, value)
        row.updated_at = datetime.now(UTC)


def _set_hobit_fields(
    review_id: uuid.UUID,
    slug: str,
    *,
    status: str,
    headline: str | None = None,
    self_score: int | None = None,
    comments: list[dict] | None = None,
    raw_output: str | None = None,
    error: str | None = None,
    duration: float | None = None,
    started: bool = False,
    finished: bool = False,
) -> None:
    with unit_of_work() as session:
        row = SqlMrHobitReviewRepository(session).get(review_id, slug)
        if row is None:
            return
        row.status = status
        if headline is not None:
            row.headline = headline
        if self_score is not None:
            row.self_score = self_score
        if comments is not None:
            row.comments = comments
        if raw_output is not None:
            row.raw_output = raw_output
        if error is not None:
            row.error = error
        if duration is not None:
            row.duration_seconds = duration
        if started:
            row.started_at = datetime.now(UTC)
        if finished:
            row.finished_at = datetime.now(UTC)


def _hobit_statuses(review_id: uuid.UUID) -> list[str]:
    with unit_of_work() as session:
        return [r.status for r in SqlMrHobitReviewRepository(session).list_for_review(review_id)]


def _fail_all_sections(review_id: uuid.UUID, message: str) -> None:
    with unit_of_work() as session:
        row = session.get(MergeReviewRow, review_id)
        if row is None:
            return
        for section in _AI_SECTIONS:
            setattr(row, section, "failed")
        row.overall_status = "failed"
        row.error = message
        row.updated_at = datetime.now(UTC)
    with unit_of_work() as session:
        for r in SqlMrHobitReviewRepository(session).list_for_review(review_id):
            if r.status in ("pending", "running"):
                r.status = "agent_unavailable"
                r.error = message


def _stamp_failure(review_id: uuid.UUID, message: str) -> None:
    """Last-resort stamp so a crashed pipeline never strands a review in `running`."""
    try:
        with unit_of_work() as session:
            row = session.get(MergeReviewRow, review_id)
            if row is None:
                return
            row.overall_status = "failed"
            row.error = message
            for section in _AI_SECTIONS:
                if getattr(row, section) in ("pending", "running"):
                    setattr(row, section, "failed")
            row.updated_at = datetime.now(UTC)
    except Exception:
        logger.exception("Could not stamp pipeline failure for %s", review_id)
