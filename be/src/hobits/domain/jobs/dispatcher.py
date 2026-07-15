"""The completion dispatcher: applies settled jobs' results to their domains.

A daemon thread (started from the FastAPI lifespan) LISTENs on the engine's done-channel and, on
every notification or 10-second tick, sweeps for settled-but-unapplied jobs. The sweep is the
source of truth — a missed notification (BE restart, dropped connection) only costs latency.

Each application is claimed atomically (`result_applied false → true`), so a job's handler runs
exactly once even if a notification and a sweep race. A handler crash is logged and never kills
the dispatcher; the job stays applied (its domain rows keep whatever state the handler reached),
and the failure is visible in the server logs.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid

import psycopg

from hobits.core.db import unit_of_work
from hobits.core.settings import get_settings
from hobits.domain.jobs.handlers import HANDLERS
from hobits.domain.jobs.repositories import SqlEngineConfigRepository, SqlJobRepository
from hobits.domain.jobs.services import JOBS_DONE_CHANNEL

logger = logging.getLogger(__name__)

_SWEEP_TIMEOUT_SECONDS = 10.0
_RECONNECT_DELAY_SECONDS = 5.0
_CLEANUP_INTERVAL_SECONDS = 3600.0


def start(stop_event: threading.Event) -> threading.Thread:
    thread = threading.Thread(target=_run, args=(stop_event,), daemon=True, name="job-dispatcher")
    thread.start()
    return thread


def _run(stop_event: threading.Event) -> None:
    # Raw psycopg DSN: strip SQLAlchemy's driver suffix.
    dsn = get_settings().database_url.replace("postgresql+psycopg://", "postgresql://")
    logger.info("Job dispatcher listening on %s", JOBS_DONE_CHANNEL)
    last_cleanup = 0.0
    while not stop_event.is_set():
        try:
            with psycopg.connect(dsn, autocommit=True) as conn:
                conn.execute(f"LISTEN {JOBS_DONE_CHANNEL}")
                _sweep()  # catch anything that settled while we weren't listening
                while not stop_event.is_set():
                    notified = False
                    for notify in conn.notifies(timeout=_SWEEP_TIMEOUT_SECONDS):
                        notified = True
                        _apply(uuid.UUID(notify.payload))
                    if not notified:
                        _sweep()
                    if time.monotonic() - last_cleanup >= _CLEANUP_INTERVAL_SECONDS:
                        _cleanup()
                        last_cleanup = time.monotonic()
        except psycopg.OperationalError:
            if stop_event.is_set():
                return
            logger.exception("Dispatcher lost the database connection; reconnecting")
            stop_event.wait(_RECONNECT_DELAY_SECONDS)
        except Exception:
            logger.exception("Job dispatcher crashed; restarting")
            stop_event.wait(_RECONNECT_DELAY_SECONDS)


def _sweep() -> None:
    with unit_of_work() as session:
        pending = [row.id for row in SqlJobRepository(session).unapplied_settled()]
    for job_id in pending:
        _apply(job_id)


def _cleanup() -> None:
    """Retention: drop settled + applied jobs older than the configured keep window."""
    try:
        with unit_of_work() as session:
            retention_days = SqlEngineConfigRepository(session).get_or_create().retention_days
            if retention_days <= 0:
                return
            deleted = SqlJobRepository(session).delete_older_than(retention_days)
        if deleted:
            logger.info(
                "Retention cleanup deleted %d job(s) older than %dd", deleted, retention_days
            )
    except Exception:
        logger.exception("Retention cleanup failed")


def _apply(job_id: uuid.UUID) -> None:
    with unit_of_work() as session:
        if not SqlJobRepository(session).try_mark_applied(job_id):
            return  # already applied (or being applied) by another pass
        job = SqlJobRepository(session).get(job_id)
    if job is None:
        return
    handler = HANDLERS.get(job.kind)
    if handler is None:
        logger.warning("No completion handler for job kind %r (%s)", job.kind, job_id)
        return
    try:
        handler(job)
    except Exception:
        logger.exception("Completion handler for %s job %s crashed", job.kind, job_id)
