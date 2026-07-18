"""Completion handlers for hobit engine jobs: `hobit.run` and `hobit.feedback_distill`.

`handle_hobit_run` mirrors the old synchronous interpret/finish tail of `HobitService.run_hobit`:
map the engine outcome to a run status, parse the hobit's structured output, settle the `queued`
run row, and emit the overlays (context-pack narrative for hobits that own it, briefing item).

`handle_feedback_distill` closes the feedback cycle's slow loop: parse the distiller's guidance
and persist it so every future run of the hobit carries it in its prompt.
"""

from __future__ import annotations

import json
import logging
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from shire.core.db import unit_of_work
from shire.domain.briefing.domain import derive_tier
from shire.domain.briefing.services import BriefingService
from shire.domain.context.services import ContextService
from shire.domain.hobits.domain import (
    FeedbackEntry,
    HobitRunRecord,
    HobitRunStatus,
    SelfScore,
)
from shire.domain.hobits.models import HobitRunRow
from shire.domain.hobits.repo_hobit import extract_json_block, format_feedback_entries
from shire.domain.hobits.repositories import SqlHobitGuidanceRepository
from shire.domain.hobits.services import HobitService
from shire.domain.jobs.models import JobRow

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


# Keep the persisted guidance bounded — it rides along in every future run prompt.
_MAX_GUIDANCE_CHARS = 4000

_DISTILL_PROMPT = """\
You maintain the standing guidance for **{name}**, an autonomous repository-analysis agent. \
The user rated the agent's past reports 1-5 stars, sometimes with a comment. Distill that \
feedback into concise standing guidance the agent will follow on every future run, on any \
repository. Do not use any tools — everything you need is below.

## Current standing guidance

{current_guidance}

## Feedback entries (newest first)

{entries}

## Rules

- Extract durable preferences (tone, depth, format, focus areas) — not one-off remarks about \
a single report.
- Learn from both ends: what to keep doing (high ratings) and what to stop (low ratings). On \
conflict, newer feedback wins.
- At most 10 short bullet points, imperative voice ("Lead with ...", "Avoid ...").
- The guidance must stand alone: never mention stars, ratings, feedback, or specific \
repositories.

Return ONLY a single fenced json block as the very last thing in your response, nothing after \
it. The guidance value must be a JSON string (escape any quotes/newlines). Shape:
```json
{{"guidance": "<the markdown bullet list, as a JSON string>"}}
```"""


def build_distill_prompt(
    name: str, current_guidance: str | None, entries: Sequence[FeedbackEntry]
) -> str:
    return _DISTILL_PROMPT.format(
        name=name,
        current_guidance=current_guidance or "(none yet — this is the first distillation)",
        entries=format_feedback_entries(entries),
    )


def handle_feedback_distill(job: JobRow) -> None:
    slug = job.payload["slug"]
    with unit_of_work() as session:
        guidance = SqlHobitGuidanceRepository(session)
        if HobitService(session).resolve_hobit(slug) is None:
            guidance.delete(slug)  # hobit deleted while the job was in flight
            return
        if job.status != "succeeded":
            # Release the debounce so the next rating (or the force endpoint) retries.
            guidance.clear_enqueued(slug)
            logger.warning("Feedback distillation for %s failed: %s", slug, job.error)
            return
        text = _parse_guidance(job.result or "")
        if text is None:
            guidance.clear_enqueued(slug)
            logger.warning("Could not parse distilled guidance for %s", slug)
            return
        guidance.apply_distilled(
            slug, text[:_MAX_GUIDANCE_CHARS], int(job.payload.get("feedback_count") or 0)
        )


def _parse_guidance(result: str) -> str | None:
    block = extract_json_block(result)
    if block is None:
        return None
    try:
        data = json.loads(block)
    except (json.JSONDecodeError, ValueError):
        return None
    text = data.get("guidance") if isinstance(data, dict) else None
    if not isinstance(text, str) or not text.strip():
        return None
    return text.strip()


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
