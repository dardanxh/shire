"""The worker loop: LISTEN for new jobs (poll as fallback), claim, execute, settle.

Concurrency model: a thread pool of `concurrency` slots guarded by a semaphore. The main thread
is the only claimer — it claims while slots are free, then blocks on the LISTEN connection until
a notification or the poll timeout wakes it. Execution threads use their own short-lived DB
connections, so nothing shares a psycopg connection across threads.
"""

from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import psycopg

from engine import db
from engine.claude_cli import ClaudeCliEngine
from engine.model import Engine, EngineRequest
from engine.settings import EngineSettings, get_settings

logger = logging.getLogger(__name__)


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


def _execute(
    settings: EngineSettings, engine: Engine, job: dict[str, Any], slots: threading.Semaphore
) -> None:
    job_id = job["id"]
    try:
        request = build_request(job)
        logger.info(
            "Running job %s (%s), timeout %.0fs", job_id, job["kind"], request.timeout_seconds
        )
        result = engine.run(request)
        db.complete(
            settings.database_url,
            job_id,
            ok=result.ok,
            text=result.text,
            error=result.error,
            duration=result.duration_seconds,
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
    finally:
        slots.release()


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

    slots = threading.Semaphore(settings.concurrency)
    pool = ThreadPoolExecutor(max_workers=settings.concurrency, thread_name_prefix="engine-job")
    last_sweep = 0.0

    logger.info(
        "Engine %s listening on %s (concurrency=%d, poll=%.0fs)",
        settings.worker_id,
        db.JOBS_NEW_CHANNEL,
        settings.concurrency,
        settings.poll_interval_seconds,
    )

    while True:
        try:
            with db.connect(settings.database_url) as listen_conn:
                listen_conn.execute(f"LISTEN {db.JOBS_NEW_CHANNEL}")
                while True:
                    if time.monotonic() - last_sweep >= settings.stale_sweep_interval_seconds:
                        db.sweep_stale(settings.database_url, settings.max_attempts)
                        last_sweep = time.monotonic()

                    # Claim as long as a slot is free and pending jobs exist.
                    while slots.acquire(blocking=False):
                        job = db.claim_next(settings.database_url, settings.worker_id)
                        if job is None:
                            slots.release()
                            break
                        pool.submit(_execute, settings, engine, job, slots)

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
