"""The worker loop: LISTEN for new jobs (poll as fallback), claim, execute, settle.

Concurrency model: a thread pool with a fixed ceiling; the *target* concurrency comes from the
shared `engine_config` row (editable from the Jobs → Config tab) and is refreshed every poll
tick, so operators can dial it up or down across all instances without restarts. The main
thread is the only claimer — it claims while in-flight jobs are below target, then blocks on
the LISTEN connection until a notification or the poll timeout wakes it. Execution threads use
their own short-lived DB connections, so nothing shares a psycopg connection across threads.
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Any

import psycopg

from engine import db
from engine.claude_cli import ClaudeCliEngine
from engine.model import Engine, EngineRequest
from engine.settings import EngineSettings, get_settings

logger = logging.getLogger(__name__)

# Hard per-instance ceiling (executor size). The live target from engine_config is clamped to
# this; scaling beyond it means starting more engine instances.
_MAX_CONCURRENCY = 16

# Live-transcript bounds: keep the newest N events, flush to the DB at most once a second.
_PROGRESS_MAX_EVENTS = 400
_PROGRESS_FLUSH_SECONDS = 1.0


def build_request(job: dict[str, Any]) -> EngineRequest:
    payload = job["payload"] or {}
    return EngineRequest(
        prompt=job["prompt"],
        system=payload.get("system"),
        cwd=payload.get("cwd", "."),
        allowed_tools=tuple(payload.get("allowed_tools") or ("Read", "Grep", "Glob")),
        model=payload.get("model"),
        timeout_seconds=float(payload.get("timeout_seconds") or 500.0),
    )


def _execute(settings: EngineSettings, engine: Engine, job: dict[str, Any]) -> None:
    job_id = job["id"]
    try:
        request = build_request(job)
        logger.info(
            "Running job %s (%s), model %s, timeout %.0fs",
            job_id,
            job["kind"],
            request.model or "default",
            request.timeout_seconds,
        )
        events: list[dict] = []
        last_flush = 0.0

        def on_event(event: dict) -> None:
            nonlocal last_flush
            events.append(event)
            if len(events) > _PROGRESS_MAX_EVENTS:
                events[:] = events[-_PROGRESS_MAX_EVENTS:]
            now = time.monotonic()
            if now - last_flush >= _PROGRESS_FLUSH_SECONDS:
                last_flush = now
                try:
                    db.update_progress(settings.database_url, job_id, events)
                except Exception:
                    logger.debug("Progress flush failed for job %s", job_id, exc_info=True)

        result = engine.run(request, on_event=on_event)
        if events:
            try:
                db.update_progress(settings.database_url, job_id, events)
            except Exception:
                logger.debug("Final progress flush failed for job %s", job_id, exc_info=True)
        db.complete(
            settings.database_url,
            job_id,
            ok=result.ok,
            text=result.text,
            error=result.error,
            duration=result.duration_seconds,
            usage=result.usage,
        )
        logger.info(
            "Job %s %s in %.1fs%s",
            job_id,
            "succeeded" if result.ok else "failed",
            result.duration_seconds,
            f" — {result.error}" if result.error else "",
        )
    except Exception:
        logger.exception("Job %s crashed in the worker", job_id)
        try:
            db.complete(
                settings.database_url,
                job_id,
                ok=False,
                text="",
                error="engine worker crashed while running the job — see engine logs",
                duration=0.0,
            )
        except Exception:
            logger.exception("Could not settle crashed job %s", job_id)


def main() -> None:
    settings = get_settings()
    engine: Engine = ClaudeCliEngine(binary=settings.claude_binary)
    if not engine.available():
        logger.warning(
            "The '%s' CLI is not available — jobs will fail until it is installed/logged in.",
            settings.claude_binary,
        )

    recovered = db.recover_own(settings.database_url, settings.worker_id)
    if recovered:
        logger.info(
            "Requeued %d job(s) left running by a previous %s", recovered, settings.worker_id
        )

    pool = ThreadPoolExecutor(max_workers=_MAX_CONCURRENCY, thread_name_prefix="engine-job")
    active: set[Future] = set()
    target_concurrency = settings.concurrency
    max_attempts = settings.max_attempts
    last_sweep = 0.0
    last_config = 0.0

    logger.info(
        "Engine %s listening on %s (concurrency=%d, poll=%.0fs)",
        settings.worker_id,
        db.JOBS_NEW_CHANNEL,
        target_concurrency,
        settings.poll_interval_seconds,
    )

    while True:
        try:
            with db.connect(settings.database_url) as listen_conn:
                listen_conn.execute(f"LISTEN {db.JOBS_NEW_CHANNEL}")
                while True:
                    # Refresh the shared runtime config (Config-tab edits apply within a tick).
                    if time.monotonic() - last_config >= settings.poll_interval_seconds:
                        config = db.fetch_config(settings.database_url)
                        if config is not None:
                            new_target = min(
                                int(config["concurrency"] or settings.concurrency),
                                _MAX_CONCURRENCY,
                            )
                            if new_target != target_concurrency:
                                logger.info(
                                    "Concurrency target %d → %d (config change)",
                                    target_concurrency,
                                    new_target,
                                )
                            target_concurrency = new_target
                            max_attempts = int(config["max_attempts"] or settings.max_attempts)
                        last_config = time.monotonic()

                    if time.monotonic() - last_sweep >= settings.stale_sweep_interval_seconds:
                        db.sweep_stale(settings.database_url, max_attempts)
                        last_sweep = time.monotonic()

                    # Claim as long as we're under the live target and pending jobs exist.
                    active = {f for f in active if not f.done()}
                    while len(active) < target_concurrency:
                        job = db.claim_next(settings.database_url, settings.worker_id)
                        if job is None:
                            break
                        active.add(pool.submit(_execute, settings, engine, job))

                    # Block until a new-job notification or the poll timeout, then loop back to
                    # claiming. Drain the generator so bursts collapse into one claim pass.
                    for _ in listen_conn.notifies(timeout=settings.poll_interval_seconds):
                        pass
        except KeyboardInterrupt:
            logger.info("Shutting down — in-flight jobs keep running until done.")
            pool.shutdown(wait=True)
            return
        except psycopg.OperationalError:
            logger.exception("Lost the database connection; retrying in 5s")
            time.sleep(5)
        except Exception:
            logger.exception("Worker loop crashed; retrying in 5s")
            time.sleep(5)
