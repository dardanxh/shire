"""AI action jobs: the completion handler that stores a run's result on its action.

Only the latest run is kept. A succeeded run replaces the report; a failed one records why but
leaves the previous report in place, so a flaky connector doesn't blank yesterday's page.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from shire.core.db import unit_of_work
from shire.domain.ai_actions.domain import normalise_report
from shire.domain.ai_actions.models import AiActionRow
from shire.domain.jobs.models import JobRow

logger = logging.getLogger(__name__)


def handle_ai_action_run(job: JobRow) -> None:
    action_id = uuid.UUID(job.payload["action_id"])
    with unit_of_work() as session:
        apply_result(session.get(AiActionRow, action_id), job)


def apply_result(action: AiActionRow | None, job: JobRow) -> None:
    # Deleted action, or a stale job (a newer run has been queued since): nothing to record.
    if action is None or action.last_job_id != job.id:
        return
    action.last_finished_at = job.finished_at or datetime.now(UTC)
    action.last_duration_seconds = job.duration_seconds
    action.last_usage = job.usage

    if job.status == "cancelled":
        action.last_status = "failed"
        action.last_error = "The run was cancelled before it started."
        return
    if job.status != "succeeded":
        action.last_status = "failed"
        action.last_error = job.error or "The run failed."
        return

    report = normalise_report(job.result or "", title=action.title)
    if report is None:
        action.last_status = "failed"
        action.last_error = "The run finished but produced no report."
        return
    action.last_status = "succeeded"
    action.last_error = None
    action.last_report_html, action.last_report_format = report
    action.last_report_at = action.last_finished_at
