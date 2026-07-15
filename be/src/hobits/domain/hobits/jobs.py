"""Completion handler for `hobit.run` engine jobs.

Mirrors the old synchronous interpret/finish tail of `HobitService.run_hobit`: map the engine
outcome to a run status, parse the hobit's structured output, settle the `queued` run row, and
emit the overlays (context-pack narrative for hobits that own it, briefing item).
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from hobits.core.db import unit_of_work
from hobits.domain.briefing.domain import derive_tier
from hobits.domain.briefing.services import BriefingService
from hobits.domain.context.services import ContextService
from hobits.domain.hobits.domain import HobitRunRecord, HobitRunStatus, SelfScore
from hobits.domain.hobits.models import HobitRunRow
from hobits.domain.hobits.services import HobitService
from hobits.domain.jobs.models import JobRow

logger = logging.getLogger(__name__)

# Neutral self-score used when the agent produced prose but no parseable structured block.
_FALLBACK_SCORE = SelfScore(importance=50, confidence=20, urgency=30)


def handle_hobit_run(job: JobRow) -> None:
    run_id = uuid.UUID(job.payload["run_id"])
    with unit_of_work() as session:
        row = session.get(HobitRunRow, run_id)
        if row is None or row.status != HobitRunStatus.queued.value:
            return  # run deleted, or already settled by an earlier dispatch

        row.raw_output = job.result
        row.duration_seconds = job.duration_seconds
        row.finished_at = datetime.now(UTC)

        if job.status != "succeeded":
            row.status = _failure_status(job.error)
            row.error = job.error
        else:
            _apply_output(session, row, job)

        # Overlays, exactly as the old `_finish`: the narrative only for hobits that own it,
        # a briefing item always (no-op for unscored runs).
        if job.payload.get("writes_narrative") and row.narrative is not None:
            ContextService(session).set_narrative(row.repository_id, row.narrative)
        BriefingService(session).create_from_run(_record_of(row))


def _apply_output(session, row: HobitRunRow, job: JobRow) -> None:
    hobit = HobitService(session).resolve_hobit(row.hobit_slug)
    if hobit is None:  # custom hobit deleted while the job was in flight
        row.status = HobitRunStatus.error.value
        row.error = "The hobit no longer exists."
        return

    output = hobit.parse_output(job.result or "")
    if output is None:
        # Keep the prose so the human still gets value; neutral score → quiet briefing item.
        repo_slug = job.payload.get("repo_slug", "the repository")
        row.status = HobitRunStatus.parse_failed.value
        row.headline = f"Onboarding notes for {repo_slug} (needs review)"
        row.narrative = job.result or None
        row.importance = _FALLBACK_SCORE.importance
        row.confidence = _FALLBACK_SCORE.confidence
        row.urgency = _FALLBACK_SCORE.urgency
        row.tier = derive_tier(
            _FALLBACK_SCORE.importance, _FALLBACK_SCORE.confidence, _FALLBACK_SCORE.urgency
        ).value
        row.error = "Could not parse the hobit's structured output."
        return

    row.status = HobitRunStatus.completed.value
    row.headline = output.headline
    row.narrative = output.narrative
    row.importance = output.self_score.importance
    row.confidence = output.self_score.confidence
    row.urgency = output.self_score.urgency
    row.tier = derive_tier(
        output.self_score.importance, output.self_score.confidence, output.self_score.urgency
    ).value


def _failure_status(error: str | None) -> str:
    if error and "timed out" in error:
        return HobitRunStatus.timeout.value
    if error and "could not launch" in error:
        return HobitRunStatus.agent_unavailable.value
    return HobitRunStatus.error.value


def _record_of(row: HobitRunRow) -> HobitRunRecord:
    return HobitRunRecord(
        id=row.id,
        repository_id=row.repository_id,
        hobit_slug=row.hobit_slug,
        status=row.status,
        trigger=row.trigger,
        commit_sha=row.commit_sha,
        headline=row.headline,
        narrative=row.narrative,
        importance=row.importance,
        confidence=row.confidence,
        urgency=row.urgency,
        tier=row.tier,
        raw_output=row.raw_output,
        error=row.error,
        duration_seconds=row.duration_seconds,
        started_at=row.started_at,
        finished_at=row.finished_at,
    )
