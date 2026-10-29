"""AI Actions service: CRUD, queueing runs (manual and scheduled), and the latest report.

Runs go through the generic job queue as `ai_action.run`, a host-runner kind: only the operator's
own logged-in `claude` CLI has their claude.ai connectors (Slack, GitHub, Jira, BigQuery...) and
their user-level skills, so the Docker engine never claims these (scripts/host-runner.sh).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from shire.core.exceptions import ConflictError, NotFoundError, ValidationError
from shire.domain.ai_actions.domain import (
    RESULT_FILE,
    ScheduleError,
    build_system_prompt,
    denied_tools,
    next_run_after,
    validate_schedule,
)
from shire.domain.ai_actions.models import AiActionRow
from shire.domain.ai_actions.repositories import SqlAiActionRepository
from shire.domain.ai_actions.schemas import (
    AiActionResult,
    AiActionRunAllResult,
    AiActionRunnerResult,
    CreateAiAction,
    UpdateAiAction,
)
from shire.domain.jobs import kinds
from shire.domain.jobs.services import JobService

_UNSETTLED_JOB_STATUSES = ("pending", "running")


class AiActionService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._actions = SqlAiActionRepository(session)
        self._jobs = JobService(session)

    # --- reads --------------------------------------------------------------------------
    def list(self) -> list[AiActionResult]:
        rows = self._actions.list()
        return self._results(rows)

    def get(self, action_id: uuid.UUID) -> AiActionResult:
        return self._results([self._require(action_id)])[0]

    def report_html(self, action_id: uuid.UUID) -> str:
        row = self._actions.get(action_id, with_report=True)
        if row is None:
            raise NotFoundError("AI action not found")
        if not row.last_report_html:
            raise NotFoundError("This action has no report yet")
        return row.last_report_html

    def runner(self) -> AiActionRunnerResult:
        return AiActionRunnerResult(
            connected=self._actions.host_runner_connected(),
            queued=self._jobs.count_pending(kinds.AI_ACTION_RUN),
        )

    # --- writes -------------------------------------------------------------------------
    def create(self, data: CreateAiAction) -> AiActionResult:
        now = datetime.now(UTC)
        row = AiActionRow(created_at=now, updated_at=now)
        self._apply(row, data, now)
        self._actions.add(row)
        return self.get(row.id)

    def update(self, action_id: uuid.UUID, data: UpdateAiAction) -> AiActionResult:
        row = self._require(action_id)
        now = datetime.now(UTC)
        self._apply(row, data, now)
        row.updated_at = now
        self._session.flush()
        return self.get(row.id)

    def delete(self, action_id: uuid.UUID) -> None:
        row = self._require(action_id)
        # A queued run would otherwise still execute (and spend a session) for nothing.
        self._cancel_queued(row)
        self._actions.delete(action_id)

    def run(
        self, action_id: uuid.UUID, *, trigger: str = "manual", arguments: str = ""
    ) -> AiActionResult:
        row = self._actions.get_for_update(action_id)
        if row is None:
            raise NotFoundError("AI action not found")
        if self._in_flight(row):
            raise ConflictError("This action is already queued or running.")
        self._enqueue(row, trigger=trigger, now=datetime.now(UTC), arguments=arguments)
        return self.get(row.id)

    def run_all(self) -> AiActionRunAllResult:
        """Refresh every report: queue a manual run of each action that isn't already queued or
        running, with the arguments its last manual run used. Paused schedules don't matter here,
        just as they don't for Run now."""
        now = datetime.now(UTC)
        queued = skipped = 0
        for row in self._actions.list():
            if self._in_flight(row):
                skipped += 1
                continue
            self._enqueue(row, trigger="manual", now=now, arguments=row.last_arguments or "")
            queued += 1
        return AiActionRunAllResult(queued=queued, skipped=skipped)

    def cancel(self, action_id: uuid.UUID) -> AiActionResult:
        """Withdraw a run that no worker has picked up yet. A running one can't be stopped."""
        row = self._require(action_id)
        if not self._cancel_queued(row):
            raise ConflictError("Only a queued run can be cancelled.")
        return self.get(row.id)

    def run_due(self, now: datetime | None = None) -> int:
        """Queue every enabled action whose slot has passed (the ticker calls this). Each due
        action is rescheduled from *now*, so a backend that was down for a day runs an overdue
        action once rather than once per missed slot. An action still busy with its previous
        run skips the slot."""
        now = now or datetime.now(UTC)
        started = 0
        for row in self._actions.claim_due(now):
            if not self._in_flight(row):
                self._enqueue(row, trigger="schedule", now=now)
                started += 1
            row.next_run_at = next_run_after(row.schedule, now, row.timezone)
        return started

    # --- internals ----------------------------------------------------------------------
    def _require(self, action_id: uuid.UUID) -> AiActionRow:
        row = self._actions.get(action_id)
        if row is None:
            raise NotFoundError("AI action not found")
        return row

    def _apply(
        self, row: AiActionRow, data: CreateAiAction | UpdateAiAction, now: datetime
    ) -> None:
        if data.model is not None and data.model not in kinds.AVAILABLE_MODELS:
            raise ValidationError(f"Unknown model: {data.model}")
        try:
            schedule = validate_schedule(data.schedule, data.timezone)
        except ScheduleError as exc:
            raise ValidationError(str(exc)) from exc
        reschedule = (
            row.next_run_at is None
            or row.schedule != schedule
            or row.timezone != data.timezone
            or row.enabled != data.enabled
        )
        row.title = data.title.strip()
        row.prompt = data.prompt.strip()
        row.model = data.model or None
        row.schedule = schedule
        row.timezone = data.timezone
        row.enabled = data.enabled
        row.allow_shell = data.allow_shell
        row.timeout_seconds = data.timeout_seconds
        if reschedule:
            row.next_run_at = next_run_after(schedule, now, data.timezone) if data.enabled else None

    def _in_flight(self, row: AiActionRow) -> bool:
        if row.last_status != "pending" or row.last_job_id is None:
            return False
        job = self._jobs.summaries([row.last_job_id]).get(row.last_job_id)
        return job is not None and job.status in _UNSETTLED_JOB_STATUSES

    def _cancel_queued(self, row: AiActionRow) -> bool:
        if row.last_status != "pending" or row.last_job_id is None:
            return False
        job = self._jobs.summaries([row.last_job_id]).get(row.last_job_id)
        if job is None or job.status != "pending":
            return False
        self._jobs.cancel(row.last_job_id)
        return True

    def _enqueue(
        self, row: AiActionRow, *, trigger: str, now: datetime, arguments: str = ""
    ) -> None:
        model = row.model or self._jobs.engine_defaults()[0]
        # One line, so arguments can't smuggle a new paragraph of instructions under the prompt.
        arguments = " ".join(arguments.split())
        job = self._jobs.enqueue(
            kind=kinds.AI_ACTION_RUN,
            title=f"AI action: {row.title}" + (f" ({arguments})" if arguments else ""),
            # The user's prompt runs verbatim (a slash command like `/my-skill` must stay the
            # first thing in it), arguments after it; the report contract rides in the appended
            # system prompt.
            prompt=f"{row.prompt} {arguments}" if arguments else row.prompt,
            payload={
                "action_id": str(row.id),
                "trigger": trigger,
                "system": build_system_prompt(),
                "model": model,
                "timeout_seconds": row.timeout_seconds,
                # The connector set isn't known up front, so the deny-list is the boundary.
                "permission_mode": "bypassPermissions",
                "disallowed_tools": denied_tools(allow_shell=row.allow_shell),
                # User-level skills and plugins (what `/my-skill` prompts need).
                "setting_sources": "user",
                "result_file": RESULT_FILE,
            },
        )
        row.last_job_id = job.id
        row.last_status = "pending"
        row.last_trigger = trigger
        if trigger == "manual":
            row.last_arguments = arguments or None
        row.last_queued_at = now
        row.last_error = None

    def _results(self, rows: list[AiActionRow]) -> list[AiActionResult]:
        pending_jobs = [r.last_job_id for r in rows if r.last_status == "pending" and r.last_job_id]
        jobs = self._jobs.summaries(pending_jobs)
        results = []
        for row in rows:
            job = jobs.get(row.last_job_id) if row.last_job_id else None
            results.append(
                AiActionResult.of(
                    row,
                    job_status=job.status if job else None,
                    job_started_at=job.started_at if job else None,
                )
            )
        return results
