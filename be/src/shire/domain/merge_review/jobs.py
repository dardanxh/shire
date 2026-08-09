"""The merge-review analysis as a job chain.

Replaces the old daemon-thread pipeline: each Claude stage is now a job executed by the engine
service, and the completion handlers here parse the result, persist it, and enqueue the next
stage — classification → overview → per-hobit reviews (fanned out) → deterministic risk +
finalize. Every handler mirrors its old pipeline stage exactly; only `agent.run()` became a job.

Chain guarantees:
- A failed stage never stalls the chain — handlers run for failed jobs too and always enqueue
  the next stage (the old pipeline also continued past failed stages).
- The risk/finalize step is claimed atomically (`risk_status pending→running`) so it runs exactly
  once even when two hobit-review completions race.
- A stale job (from a re-analyze while one was in flight, or a stale-sweep straggler) no-ops via
  the `analyzed_source_sha` guard.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import update
from sqlalchemy.orm import Session

from shire.core.db import unit_of_work
from shire.core.exceptions import NotFoundError
from shire.domain.context.services import ContextService
from shire.domain.hobits.domain import HobitConfig
from shire.domain.hobits.services import HobitService
from shire.domain.jobs import kinds
from shire.domain.jobs.models import JobRow
from shire.domain.jobs.services import JobService
from shire.domain.merge_review.domain import Footprint, MrComment, compute_risk
from shire.domain.merge_review.models import MergeReviewRow, MrPrincipleCheckRow
from shire.domain.merge_review.mr_hobit import (
    MrContext,
    MrHobit,
    build_classification_prompt,
    build_hobit_review_batch_prompt,
    build_overview_prompt,
    build_principle_check_batch_prompt,
    build_principle_check_prompt,
    footprint_summary,
    parse_classification,
    parse_overview,
    parse_review_batch,
)
from shire.domain.merge_review.repositories import (
    SqlMergeReviewRepository,
    SqlMrHobitReviewRepository,
    SqlMrPrincipleCheckRepository,
)
from shire.domain.principles.jobs import (
    BATCH_MAX_VIOLATIONS,
    BATCH_SIZE,
    MAX_VIOLATIONS,
    parse_batch_verdicts,
    parse_verdict,
)
from shire.domain.principles.models import PrincipleRow
from shire.domain.repository.repositories import SqlRepositoryRepository
from shire.integrations.git_diff import diff_excerpt

logger = logging.getLogger(__name__)

_SETTLED_HOBIT_STATUSES_EXCLUDED = ("pending", "running")


@dataclass(frozen=True)
class _Inputs:
    repository_id: uuid.UUID
    repo_slug: str
    clone_path: str
    source_branch: str
    target_branch: str
    analyzed_source_sha: str | None
    footprint: Footprint
    hobit_configs: list[HobitConfig]  # one per selected slug, resolution order preserved
    context_markdown: str


# --- enqueue (called by the service inside the request transaction) -----------------------------


def enqueue_classification(session: Session, review_id: uuid.UUID) -> None:
    """Kick off the chain: claim the review (pending → running) and enqueue the first stage.
    The caller commits; the job notification fires with that commit."""
    if not SqlMergeReviewRepository(session).try_claim(review_id):
        return
    inputs = _load_inputs(session, review_id)
    if inputs is None:
        _fail_all_sections(
            session, review_id, "The repository or its clone is no longer available."
        )
        return
    ctx = _build_ctx(inputs)
    jobs = JobService(session)
    # Classification is simple labeling with proportions — the light tier is plenty.
    _, timeout_seconds = jobs.engine_defaults()
    model = jobs.light_model()
    row = session.get(MergeReviewRow, review_id)
    if row is not None:
        row.classification_status = "running"
        row.updated_at = datetime.now(UTC)
    jobs.enqueue(
        kind=kinds.MR_CLASSIFICATION,
        title=_title("classification", inputs),
        prompt=build_classification_prompt(ctx),
        payload={
            "cwd": inputs.clone_path,
            "model": model,
            "timeout_seconds": timeout_seconds,
            "review_id": str(review_id),
            "analyzed_source_sha": inputs.analyzed_source_sha,
        },
        repository_id=inputs.repository_id,
    )


def enqueue_hobit_rerun(session: Session, review_id: uuid.UUID, slug: str) -> bool:
    """Re-run a single hobit's review of this MR, in place.

    Off-chain like the principle checks: user-triggered, never enqueued by the pipeline, so it
    must not claim the review or disturb the settled sections. The completion handler's
    `_maybe_finish` is harmless afterwards — on a settled review the atomic `risk_status`
    claim fails and it exits without touching anything.

    The previous verdict is cleared rather than kept: there is one current answer for "what
    does this hobit say about this diff", and stale comments would read as the new run's.
    """
    inputs = _load_inputs(session, review_id)
    if inputs is None:
        return False
    hobit_row = SqlMrHobitReviewRepository(session).get(review_id, slug)
    if hobit_row is None:
        return False
    hobits = HobitService(session)
    spec = hobits.resolve_spec(slug)
    if spec is None:
        return False
    config = hobits.effective_config_for(spec)

    hobit_row.status = "running"
    hobit_row.started_at = datetime.now(UTC)
    hobit_row.finished_at = None
    hobit_row.headline = None
    hobit_row.self_score = None
    hobit_row.comments = None
    hobit_row.raw_output = None
    hobit_row.error = None
    hobit_row.duration_seconds = None

    ctx = _build_ctx(inputs)
    JobService(session).enqueue(
        kind=kinds.MR_HOBIT_REVIEW,
        title=f"MR review by {spec.name} — {inputs.repo_slug}: "
        f"{inputs.source_branch}→{inputs.target_branch}",
        prompt=MrHobit(spec).build_prompt(ctx, config.instructions),
        payload={
            "system": config.charter,
            "cwd": inputs.clone_path,
            "model": config.model,
            "timeout_seconds": config.timeout_seconds,
            "review_id": str(review_id),
            "slug": slug,
            "analyzed_source_sha": inputs.analyzed_source_sha,
        },
        repository_id=inputs.repository_id,
    )
    return True


def enqueue_principle_checks(
    session: Session, review_id: uuid.UUID, principles: list[PrincipleRow]
) -> None:
    """Fan out one diff-scoped audit job per principle the user picked.

    Off-chain on purpose: this is user-triggered, never part of the analysis pipeline, so it
    neither claims the review nor feeds `_maybe_finish`. Running it must not disturb an
    in-flight analysis or re-open a settled one. The diff excerpt is built once and shared —
    it is a git call per review, not per principle.
    """
    inputs = _load_inputs(session, review_id)
    if inputs is None:
        return
    ctx = _build_ctx(inputs)
    jobs = JobService(session)
    model, timeout_seconds = jobs.engine_defaults()
    checks = SqlMrPrincipleCheckRepository(session)
    now = datetime.now(UTC)

    runnable: list[tuple[PrincipleRow, MrPrincipleCheckRow]] = []
    for principle in principles:
        check = checks.get(review_id, principle.id)
        if check is None:
            check = MrPrincipleCheckRow(
                merge_review_id=review_id,
                principle_id=principle.id,
                created_at=now,
            )
            checks.add(check)
        # Re-running replaces the previous verdict in place: there is one current answer for
        # "does this diff uphold this principle", and stale fields would read as the new one.
        check.status = "pending"
        check.summary = None
        check.violations = None
        check.error = None
        check.finished_at = None
        check.duration_seconds = None
        check.analyzed_source_sha = inputs.analyzed_source_sha
        runnable.append((principle, check))

    if len(runnable) <= 1 or not jobs.batch_checks_enabled():
        for principle, check in runnable:
            job = jobs.enqueue(
                kind=kinds.MR_PRINCIPLE_CHECK,
                title=f"MR principle check: {principle.name} — {inputs.repo_slug}: "
                f"{inputs.source_branch}→{inputs.target_branch}",
                prompt=build_principle_check_prompt(
                    ctx,
                    name=principle.name,
                    severity=principle.severity,
                    statement=principle.statement,
                    max_violations=MAX_VIOLATIONS,
                ),
                payload={
                    "cwd": inputs.clone_path,
                    "model": model,
                    "timeout_seconds": timeout_seconds,
                    "review_id": str(review_id),
                    "principle_id": str(principle.id),
                    "check_id": str(check.id),
                    "analyzed_source_sha": inputs.analyzed_source_sha,
                },
                repository_id=inputs.repository_id,
            )
            check.job_id = job.id
        return

    # Batched: the shared preamble (context, footprint, diff) is sent once per chunk, and one
    # session judges every principle in it — the token win this mode exists for.
    for chunk_start in range(0, len(runnable), BATCH_SIZE):
        chunk = runnable[chunk_start : chunk_start + BATCH_SIZE]
        job = jobs.enqueue(
            kind=kinds.MR_PRINCIPLE_CHECK_BATCH,
            title=f"MR principle checks ({len(chunk)}) — {inputs.repo_slug}: "
            f"{inputs.source_branch}→{inputs.target_branch}",
            prompt=build_principle_check_batch_prompt(
                ctx,
                [principle for principle, _ in chunk],
                max_violations=BATCH_MAX_VIOLATIONS,
            ),
            payload={
                "cwd": inputs.clone_path,
                "model": model,
                "timeout_seconds": min(3600.0, timeout_seconds + 60.0 * len(chunk)),
                "review_id": str(review_id),
                "analyzed_source_sha": inputs.analyzed_source_sha,
                "checks": [
                    {
                        "check_id": str(check.id),
                        "principle_id": str(principle.id),
                        "index": i + 1,
                    }
                    for i, (principle, check) in enumerate(chunk)
                ],
            },
            repository_id=inputs.repository_id,
        )
        for _, check in chunk:
            check.job_id = job.id


# --- completion handlers (called by the jobs dispatcher) ----------------------------------------


def handle_mr_classification(job: JobRow) -> None:
    review_id = uuid.UUID(job.payload["review_id"])
    with unit_of_work() as session:
        row = _guarded_review(session, review_id, job)
        if row is None:
            return
        labels = parse_classification(job.result or "") if job.status == "succeeded" else None
        if labels is None:
            row.classification_status = "failed"
            row.error = job.error or "Could not parse the classification output."
        else:
            row.classification = [label.model_dump(mode="json") for label in labels]
            row.classification_status = "completed"
        row.updated_at = datetime.now(UTC)
    _enqueue_overview(review_id, job.payload.get("analyzed_source_sha"))


def handle_mr_overview(job: JobRow) -> None:
    review_id = uuid.UUID(job.payload["review_id"])
    with unit_of_work() as session:
        row = _guarded_review(session, review_id, job)
        if row is None:
            return
        overview = parse_overview(job.result or "") if job.status == "succeeded" else None
        if overview is None:
            row.overview_status = "failed"
            row.error = job.error or "Could not parse the overview output."
        else:
            row.overview_markdown = overview
            row.overview_status = "completed"
        row.updated_at = datetime.now(UTC)
    _enqueue_hobit_reviews(review_id, job.payload.get("analyzed_source_sha"))
    _maybe_finish(review_id)


def handle_mr_hobit_review(job: JobRow) -> None:
    review_id = uuid.UUID(job.payload["review_id"])
    slug = job.payload["slug"]
    with unit_of_work() as session:
        row = _guarded_review(session, review_id, job)
        if row is None:
            return
        hobit_row = SqlMrHobitReviewRepository(session).get(review_id, slug)
        if hobit_row is None:
            return
        hobit_row.raw_output = job.result
        hobit_row.duration_seconds = job.duration_seconds
        hobit_row.finished_at = datetime.now(UTC)

        if job.status != "succeeded":
            hobit_row.status = _failure_status(job.error)
            hobit_row.error = job.error
        else:
            spec = HobitService(session).resolve_spec(slug)
            output = MrHobit(spec).parse_output(job.result or "") if spec is not None else None
            if spec is None:
                hobit_row.status = "error"
                hobit_row.error = "The hobit no longer exists."
            elif output is None:
                hobit_row.status = "parse_failed"
                hobit_row.error = "Could not parse the hobit's structured output."
            else:
                for comment in output.comments:
                    comment.id = str(uuid.uuid4())  # stable key for the UI
                hobit_row.status = "completed"
                hobit_row.headline = output.headline
                hobit_row.self_score = output.self_score
                hobit_row.comments = [c.model_dump(mode="json") for c in output.comments]
    _maybe_finish(review_id)


def handle_mr_principle_check(job: JobRow) -> None:
    """Settle one diff-scoped principle verdict.

    Does not call `_maybe_finish`: these checks are off-chain, and letting them reach the
    finalize step would let a manual run re-run the risk stage on a settled review.
    """
    check_id = uuid.UUID(job.payload["check_id"])
    with unit_of_work() as session:
        check = session.get(MrPrincipleCheckRow, check_id)
        if check is None or check.status != "pending":
            return  # deleted with the review, or already settled by an earlier dispatch

        check.finished_at = datetime.now(UTC)
        check.duration_seconds = job.duration_seconds

        # Staleness: a re-analyze moved the review to a different sha, so this verdict is about
        # code the page no longer shows. Recorded as an error rather than dropped silently —
        # the row already exists in the UI and would otherwise spin forever.
        review = session.get(MergeReviewRow, check.merge_review_id)
        if review is None:
            return
        if check.analyzed_source_sha != review.analyzed_source_sha:
            check.status = "error"
            check.error = "The review was re-analyzed while this check ran. Run it again."
            return

        if job.status != "succeeded":
            check.status = "error"
            check.error = job.error or "The principle check job failed."
            return

        parsed = parse_verdict(job.result or "")
        if parsed is None:
            check.status = "error"
            check.error = "Could not parse the auditor's structured verdict."
            return

        verdict, summary, violations = parsed
        check.status = verdict
        check.summary = summary
        check.violations = violations
        check.error = None


def handle_mr_principle_check_batch(job: JobRow) -> None:
    """Settle every verdict of one batched principle-check session.

    Off-chain like the single handler (never calls `_maybe_finish`). Guards run once per
    batch — one review, one sha, one job outcome; only the verdict distribution is per check.
    """
    entries = job.payload.get("checks") or []  # [{check_id, principle_id, index}]
    with unit_of_work() as session:
        review = session.get(MergeReviewRow, uuid.UUID(job.payload["review_id"]))
        if review is None:
            return
        now = datetime.now(UTC)
        pending: list[tuple[dict, MrPrincipleCheckRow]] = []
        for entry in entries:
            check = session.get(MrPrincipleCheckRow, uuid.UUID(entry["check_id"]))
            if check is None or check.status != "pending":
                continue  # deleted with the review, or settled by an earlier dispatch
            check.finished_at = now
            check.duration_seconds = job.duration_seconds
            pending.append((entry, check))
        if not pending:
            return

        def fail_all(message: str) -> None:
            for _, check in pending:
                check.status = "error"
                check.error = message

        # All checks in a batch were pinned to one snapshot at enqueue.
        if job.payload.get("analyzed_source_sha") != review.analyzed_source_sha:
            fail_all("The review was re-analyzed while this check ran. Run it again.")
            return
        if job.status != "succeeded":
            fail_all(job.error or "The principle check job failed.")
            return

        parsed = parse_batch_verdicts(
            job.result or "", (entry["index"] for entry, _ in pending)
        )
        if parsed is None:
            fail_all("Could not parse the auditor's structured verdicts.")
            return

        for entry, check in pending:
            result = parsed.get(entry["index"])
            if result is None:
                check.status = "error"
                check.error = "The auditor skipped this principle."
                continue
            verdict, summary, violations = result
            check.status = verdict
            check.summary = summary
            check.violations = violations
            check.error = None


def handle_mr_hobit_review_batch(job: JobRow) -> None:
    """Distribute one review panel's output to its hobit review rows, then finalize once.

    Mirrors `handle_mr_hobit_review` per row; a reviewer the panel skipped settles as its own
    parse failure instead of poisoning the batch. `_maybe_finish` runs once — its atomic
    risk-status claim makes that safe.
    """
    review_id = uuid.UUID(job.payload["review_id"])
    slugs = job.payload.get("slugs") or []
    with unit_of_work() as session:
        row = _guarded_review(session, review_id, job)
        if row is None:
            return
        reviews = SqlMrHobitReviewRepository(session)
        now = datetime.now(UTC)
        rows: list[tuple[str, object]] = []
        for slug in slugs:
            hobit_row = reviews.get(review_id, slug)
            if hobit_row is None:
                continue
            hobit_row.raw_output = job.result
            hobit_row.duration_seconds = job.duration_seconds
            hobit_row.finished_at = now
            rows.append((slug, hobit_row))

        if job.status != "succeeded":
            for _, hobit_row in rows:
                hobit_row.status = _failure_status(job.error)
                hobit_row.error = job.error
        else:
            parsed = parse_review_batch(job.result or "", [slug for slug, _ in rows])
            for slug, hobit_row in rows:
                output = parsed.get(slug) if parsed is not None else None
                if output is None:
                    hobit_row.status = "parse_failed"
                    hobit_row.error = (
                        "Could not parse the review panel's structured output."
                        if parsed is None
                        else "The review panel skipped this reviewer."
                    )
                    continue
                for comment in output.comments:
                    comment.id = str(uuid.uuid4())  # stable key for the UI
                hobit_row.status = "completed"
                hobit_row.headline = output.headline
                hobit_row.self_score = output.self_score
                hobit_row.comments = [c.model_dump(mode="json") for c in output.comments]
    _maybe_finish(review_id)


# --- chain steps --------------------------------------------------------------------------------


def _enqueue_overview(review_id: uuid.UUID, analyzed_sha: str | None) -> None:
    with unit_of_work() as session:
        inputs = _load_inputs(session, review_id)
        if inputs is None or inputs.analyzed_source_sha != analyzed_sha:
            return
        ctx = _build_ctx(inputs)
        row = session.get(MergeReviewRow, review_id)
        if row is not None:
            row.overview_status = "running"
            row.updated_at = datetime.now(UTC)
        jobs = JobService(session)
        model, timeout_seconds = jobs.engine_defaults()
        jobs.enqueue(
            kind=kinds.MR_OVERVIEW,
            title=_title("overview", inputs),
            prompt=build_overview_prompt(ctx),
            payload={
                "cwd": inputs.clone_path,
                "model": model,
                "timeout_seconds": timeout_seconds,
                "review_id": str(review_id),
                "analyzed_source_sha": inputs.analyzed_source_sha,
            },
            repository_id=inputs.repository_id,
        )


def _enqueue_hobit_reviews(review_id: uuid.UUID, analyzed_sha: str | None) -> None:
    """Fan out one job per selected hobit. Hobits whose spec vanished settle as errors here;
    when there are no hobits at all, the section completes immediately."""
    with unit_of_work() as session:
        inputs = _load_inputs(session, review_id)
        if inputs is None or inputs.analyzed_source_sha != analyzed_sha:
            return
        row = session.get(MergeReviewRow, review_id)
        if row is None:
            return
        selected = list(row.selected_hobit_slugs or [])
        if not selected:
            row.hobits_status = "completed"
            row.updated_at = datetime.now(UTC)
            return

        row.hobits_status = "running"
        row.updated_at = datetime.now(UTC)
        ctx = _build_ctx(inputs)
        reviews = SqlMrHobitReviewRepository(session)
        configured = {config.slug: config for config in inputs.hobit_configs}
        now = datetime.now(UTC)
        jobs = JobService(session)

        runnable = []  # (slug, config, spec)
        for slug in selected:
            hobit_row = reviews.get(review_id, slug)
            if hobit_row is None:
                continue
            config = configured.get(slug)
            spec = HobitService(session).resolve_spec(slug) if config else None
            if config is None or spec is None:  # custom hobit deleted after selection
                hobit_row.status = "error"
                hobit_row.error = "The hobit no longer exists."
                hobit_row.finished_at = now
                continue
            hobit_row.status = "running"
            hobit_row.started_at = now
            runnable.append((slug, config, spec))

        if len(runnable) <= 1 or not jobs.batch_checks_enabled():
            for slug, config, spec in runnable:
                jobs.enqueue(
                    kind=kinds.MR_HOBIT_REVIEW,
                    title=f"MR review by {spec.name} — {inputs.repo_slug}: "
                    f"{inputs.source_branch}→{inputs.target_branch}",
                    prompt=MrHobit(spec).build_prompt(ctx, config.instructions),
                    payload={
                        "system": config.charter,
                        "cwd": inputs.clone_path,
                        "model": config.model,
                        "timeout_seconds": config.timeout_seconds,
                        "review_id": str(review_id),
                        "slug": slug,
                        "analyzed_source_sha": inputs.analyzed_source_sha,
                    },
                    repository_id=inputs.repository_id,
                )
            return

        # Batched panel: one session reads the diff once and files every reviewer's report.
        # Charters ride in the prompt (a batch has no single system prompt) and the model is
        # the engine default — per-hobit model/timeout overrides don't apply here; the
        # per-card re-run stays a single dedicated session for when one report disappoints.
        model, timeout_seconds = jobs.engine_defaults()
        for chunk_start in range(0, len(runnable), BATCH_SIZE):
            chunk = runnable[chunk_start : chunk_start + BATCH_SIZE]
            jobs.enqueue(
                kind=kinds.MR_HOBIT_REVIEW_BATCH,
                title=f"MR review panel ({len(chunk)} reviewers) — {inputs.repo_slug}: "
                f"{inputs.source_branch}→{inputs.target_branch}",
                prompt=build_hobit_review_batch_prompt(
                    ctx,
                    [
                        (slug, spec.name, config.charter, config.instructions)
                        for slug, config, spec in chunk
                    ],
                ),
                payload={
                    "cwd": inputs.clone_path,
                    "model": model,
                    "timeout_seconds": min(3600.0, timeout_seconds + 60.0 * len(chunk)),
                    "review_id": str(review_id),
                    "slugs": [slug for slug, _, _ in chunk],
                    "analyzed_source_sha": inputs.analyzed_source_sha,
                },
                repository_id=inputs.repository_id,
            )


def _maybe_finish(review_id: uuid.UUID) -> None:
    """When every hobit review has settled, run the deterministic risk stage and finalize —
    exactly once, via the atomic risk_status claim."""
    with unit_of_work() as session:
        statuses = [
            r.status for r in SqlMrHobitReviewRepository(session).list_for_review(review_id)
        ]
        if any(s in _SETTLED_HOBIT_STATUSES_EXCLUDED for s in statuses):
            return
        claimed = session.execute(
            update(MergeReviewRow)
            .where(MergeReviewRow.id == review_id, MergeReviewRow.risk_status == "pending")
            .values(risk_status="running", updated_at=datetime.now(UTC))
        )
        if claimed.rowcount != 1:
            return

    with unit_of_work() as session:
        row = session.get(MergeReviewRow, review_id)
        if row is None:
            return
        rows = SqlMrHobitReviewRepository(session).list_for_review(review_id)
        any_completed = any(r.status == "completed" for r in rows)
        if rows:
            row.hobits_status = "completed" if any_completed else "failed"
        try:
            comments = [
                MrComment.model_validate(c)
                for r in rows
                if r.status == "completed"
                for c in (r.comments or [])
            ]
            breakdown = compute_risk(
                Footprint.model_validate(row.footprint), comments if any_completed else None
            )
            row.risk_score = breakdown.total
            row.risk_verdict = breakdown.verdict.value
            row.risk_breakdown = breakdown.model_dump(mode="json")
            row.risk_status = "completed"
        except Exception:
            logger.exception("Risk stage failed for %s", review_id)
            row.risk_status = "failed"
        row.overall_status = "completed"
        row.analyzed_at = datetime.now(UTC)
        row.updated_at = datetime.now(UTC)


# --- shared loading / helpers -------------------------------------------------------------------


def _load_inputs(session: Session, review_id: uuid.UUID) -> _Inputs | None:
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

    return _Inputs(
        repository_id=row.repository_id,
        repo_slug=repo.coordinates.slug,
        clone_path=repo.clone_path,
        source_branch=row.source_branch,
        target_branch=row.target_branch,
        analyzed_source_sha=row.analyzed_source_sha,
        footprint=Footprint.model_validate(row.footprint),
        hobit_configs=configs,
        context_markdown=context_md,
    )


def _build_ctx(inputs: _Inputs) -> MrContext:
    excerpt = diff_excerpt(
        inputs.clone_path,
        inputs.footprint.merge_base_sha,
        inputs.footprint.source_sha,
        inputs.footprint.files,
    )
    return MrContext(
        repo_slug=inputs.repo_slug,
        source_branch=inputs.source_branch,
        target_branch=inputs.target_branch,
        clone_path=inputs.clone_path,
        context_markdown=inputs.context_markdown,
        footprint_summary=footprint_summary(inputs.footprint),
        diff_excerpt=excerpt,
    )


def _guarded_review(
    session: Session, review_id: uuid.UUID, job: JobRow
) -> MergeReviewRow | None:
    """The staleness guard: the review must still exist and still be about the sha this job
    analyzed (a re-analyze in the meantime makes the job's result meaningless)."""
    row = session.get(MergeReviewRow, review_id)
    if row is None:
        return None
    if job.payload.get("analyzed_source_sha") != row.analyzed_source_sha:
        logger.info("Dropping stale %s job for review %s", job.kind, review_id)
        return None
    return row


def _failure_status(error: str | None) -> str:
    if error and "timed out" in error:
        return "timeout"
    if error and "could not launch" in error:
        return "agent_unavailable"
    return "error"


def _title(stage: str, inputs: _Inputs) -> str:
    return (
        f"MR {stage} — {inputs.repo_slug}: {inputs.source_branch}→{inputs.target_branch}"
    )


def _fail_all_sections(session: Session, review_id: uuid.UUID, message: str) -> None:
    row = session.get(MergeReviewRow, review_id)
    if row is None:
        return
    for section in ("classification_status", "overview_status", "hobits_status", "risk_status"):
        setattr(row, section, "failed")
    row.overall_status = "failed"
    row.error = message
    row.updated_at = datetime.now(UTC)
    for r in SqlMrHobitReviewRepository(session).list_for_review(review_id):
        if r.status in ("pending", "running"):
            r.status = "agent_unavailable"
            r.error = message
