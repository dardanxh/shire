"""The AI Actions scheduler: a daemon thread (started from the FastAPI lifespan) that queues
due actions.

Deliberately not Prefect — that scheduler is opt-in and not part of the compose stack, while a
scheduled report should just work. Every tick runs in its own transaction and due rows are
claimed with `FOR UPDATE SKIP LOCKED`, so two backend instances can never double-queue a run.
"""

from __future__ import annotations

import logging
import threading

from shire.core.db import unit_of_work

logger = logging.getLogger(__name__)

_TICK_SECONDS = 30.0


def start(stop_event: threading.Event) -> threading.Thread:
    thread = threading.Thread(
        target=_run, args=(stop_event,), daemon=True, name="ai-actions-ticker"
    )
    thread.start()
    return thread


def _run(stop_event: threading.Event) -> None:
    from shire.domain.ai_actions.services import AiActionService

    while not stop_event.wait(_TICK_SECONDS):
        try:
            with unit_of_work() as session:
                started = AiActionService(session).run_due()
            if started:
                logger.info("AI actions ticker queued %d scheduled run(s)", started)
        except Exception:
            logger.exception("AI actions ticker tick failed")
