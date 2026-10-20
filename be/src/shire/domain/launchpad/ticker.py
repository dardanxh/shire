"""The Launchpad scheduler: a daemon thread (started from the FastAPI lifespan) that starts due
actions and keeps the MCP snapshot fresh.

Deliberately not Prefect — that scheduler is opt-in and not part of the compose stack, while
actions should just work. Every tick runs in its own transaction; due rows are claimed with
`FOR UPDATE SKIP LOCKED`, so a second backend instance can never double-run an action. A missed
tick (restart) only delays: overdue actions run on the next tick, once, not once per missed slot.
"""

from __future__ import annotations

import logging
import threading
import time

from shire.core.db import unit_of_work

logger = logging.getLogger(__name__)

_TICK_SECONDS = 30.0
_PROBE_INTERVAL_SECONDS = 15 * 60.0


def start(stop_event: threading.Event) -> threading.Thread:
    thread = threading.Thread(
        target=_run, args=(stop_event,), daemon=True, name="launchpad-ticker"
    )
    thread.start()
    return thread


def _run(stop_event: threading.Event) -> None:
    from shire.domain.launchpad.services import LaunchpadService
    from shire.domain.mcp.services import McpService

    last_probe = 0.0
    while not stop_event.wait(_TICK_SECONDS):
        try:
            with unit_of_work() as session:
                started = LaunchpadService(session).run_due_actions()
            if started:
                logger.info("Launchpad ticker started %d scheduled action run(s)", started)
        except Exception:
            logger.exception("Launchpad ticker tick failed")
        if time.monotonic() - last_probe >= _PROBE_INTERVAL_SECONDS:
            last_probe = time.monotonic()
            try:
                with unit_of_work() as session:
                    mcp = McpService(session)
                    # Only queue probes someone can run — otherwise they pile up as pending.
                    if mcp.host_runner_running():
                        mcp.enqueue_probe()
            except Exception:
                logger.exception("Launchpad MCP probe enqueue failed")
