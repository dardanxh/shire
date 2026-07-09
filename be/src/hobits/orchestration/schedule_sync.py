"""Reconcile repo↔hobit assignments into Prefect deployments.

Each assignment with a non-`manual` cadence maps to one Prefect deployment of `run_hobit_flow`,
named ``<repository_id>--<hobit_slug>`` and carrying that assignment's schedule (interval or cron).
`manual` (or an unassigned hobit) means *no* deployment. The Prefect worker executes whatever the
deployments' schedules fire.

Everything here is best-effort and gated on `settings.scheduler_enabled`: if the flag is off or the
Prefect server is unreachable, calls degrade to no-ops with a logged warning so the core app (manual
runs, assignment edits) keeps working without Prefect running.
"""

from __future__ import annotations

import logging
import uuid
from datetime import timedelta

from hobits.core.settings import get_settings
from hobits.domain.hobits.models import RepositoryHobitRow
from hobits.orchestration.flows import FLOW_NAME, run_hobit_flow

logger = logging.getLogger(__name__)

# Preset cadences → sensible schedules; daily/weekly fire in the morning rather than at midnight.
_DAILY_CRON = "0 8 * * *"
_WEEKLY_CRON = "0 8 * * 1"


def deployment_name(repository_id: uuid.UUID, slug: str) -> str:
    return f"{repository_id}--{slug}"


def _schedule_for(cadence: str):
    """Map a stored cadence to a Prefect schedule, or None for `manual`/unrecognized."""
    from prefect.client.schemas.schedules import CronSchedule, IntervalSchedule

    cadence = (cadence or "manual").strip()
    if cadence == "manual":
        return None
    if cadence == "hourly":
        return IntervalSchedule(interval=timedelta(hours=1))
    if cadence == "daily":
        return CronSchedule(cron=_DAILY_CRON)
    if cadence == "weekly":
        return CronSchedule(cron=_WEEKLY_CRON)
    if cadence.startswith("cron:"):
        expr = cadence[len("cron:") :].strip()
        if expr:
            return CronSchedule(cron=expr)
    logger.warning("Unrecognized cadence %r — treating as manual (no schedule).", cadence)
    return None


_PRESETS = frozenset({"manual", "hourly", "daily", "weekly"})


def validate_cadence(cadence: str) -> None:
    """Raise ValueError for a malformed cadence. Presets pass; a `cron:<expr>` value is checked by
    constructing the schedule (Prefect validates the expression). Called at the API edge so the user
    gets a clean 4xx rather than a silently-dropped schedule."""
    from prefect.client.schemas.schedules import CronSchedule

    cadence = (cadence or "").strip()
    if cadence in _PRESETS:
        return
    if cadence.startswith("cron:"):
        expr = cadence[len("cron:") :].strip()
        if not expr:
            raise ValueError("Cron cadence is missing an expression (expected 'cron:<expr>').")
        try:
            CronSchedule(cron=expr)
        except Exception as exc:  # Prefect raises on a bad cron expression
            raise ValueError(f"Invalid cron expression: {expr!r}") from exc
        return
    raise ValueError(
        f"Unknown cadence {cadence!r}. Use manual, hourly, daily, weekly, or cron:<expr>."
    )


class PrefectScheduleSync:
    """Upserts/removes Prefect deployments to match the assignment table. Constructed per call from
    a live DB session (it reads assignments) but writes only to Prefect, never the DB."""

    def __init__(self, session) -> None:
        self._session = session
        self._settings = get_settings()

    @property
    def enabled(self) -> bool:
        return self._settings.scheduler_enabled

    # --- public reconcilers ---------------------------------------------------
    def sync_assignment(self, repository_id: uuid.UUID, slug: str, cadence: str) -> None:
        """Make Prefect match one assignment's cadence (deploy a schedule, or delete for manual)."""
        if not self.enabled:
            return
        try:
            self._ensure_work_pool()
            if _schedule_for(cadence) is None:
                self._delete(deployment_name(repository_id, slug))
            else:
                self._deploy(repository_id, slug, cadence)
        except Exception:  # never let a Prefect hiccup break an assignment edit
            logger.warning("Prefect sync failed for %s/%s", repository_id, slug, exc_info=True)

    def sync_repo(self, repository_id: uuid.UUID) -> None:
        """Reconcile every assignment of one repository (called after the allow-list is saved)."""
        if not self.enabled:
            return
        for row in self._assignments(repository_id=repository_id):
            self.sync_assignment(row.repository_id, row.hobit_slug, row.cadence)

    def sync_all(self) -> None:
        """Startup convergence — reconcile every assignment across all repos."""
        if not self.enabled:
            return
        rows = self._assignments()
        logger.info("Reconciling %d hobit assignment(s) into Prefect deployments.", len(rows))
        for row in rows:
            self.sync_assignment(row.repository_id, row.hobit_slug, row.cadence)

    # --- Prefect calls --------------------------------------------------------
    def _deploy(self, repository_id: uuid.UUID, slug: str, cadence: str) -> None:
        from prefect.deployments.runner import EntrypointType

        schedule = _schedule_for(cadence)
        # A MODULE_PATH entrypoint ("hobits.orchestration.flows.run_hobit_flow") lets the worker
        # import the flow from the installed package regardless of its working directory. apply()
        # upserts by (flow name, deployment name), so re-running on a cadence change is idempotent.
        deployment = run_hobit_flow.to_deployment(
            name=deployment_name(repository_id, slug),
            schedules=[schedule],
            parameters={"repository_id": str(repository_id), "hobit_slug": slug},
            entrypoint_type=EntrypointType.MODULE_PATH,
        )
        deployment.apply(work_pool_name=self._settings.prefect_work_pool)
        logger.info("Deployed schedule for %s/%s (%s).", repository_id, slug, cadence)

    def _delete(self, name: str) -> None:
        from prefect.client.orchestration import get_client

        with get_client(sync_client=True) as client:
            try:
                dep = client.read_deployment_by_name(f"{FLOW_NAME}/{name}")
            except Exception:
                return  # nothing to remove
            client.delete_deployment(dep.id)
            logger.info("Removed schedule deployment %s.", name)

    def _ensure_work_pool(self) -> None:
        import contextlib

        from prefect.client.orchestration import get_client
        from prefect.client.schemas.actions import WorkPoolCreate
        from prefect.exceptions import ObjectAlreadyExists

        with get_client(sync_client=True) as client, contextlib.suppress(ObjectAlreadyExists):
            client.create_work_pool(
                WorkPoolCreate(name=self._settings.prefect_work_pool, type="process")
            )

    # --- reads ----------------------------------------------------------------
    def _assignments(self, repository_id: uuid.UUID | None = None) -> list[RepositoryHobitRow]:
        from sqlalchemy import select

        stmt = select(RepositoryHobitRow)
        if repository_id is not None:
            stmt = stmt.where(RepositoryHobitRow.repository_id == repository_id)
        return list(self._session.scalars(stmt))
