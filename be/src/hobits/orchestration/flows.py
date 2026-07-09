"""Prefect flows for scheduled, change-gated hobit runs.

A Prefect worker executes `run_hobit_flow` on the schedule attached to each (repo, hobit)
deployment (see `schedule_sync.py`). The flow runs outside any HTTP request, so it opens its own
transactional session and delegates to `HobitService.run_if_stale` — the same change gate the
manual run path deliberately skips. Prefect owns the schedule, retries, run history, and UI; this
module owns only "what one scheduled tick does."
"""

from __future__ import annotations

import uuid

from prefect import flow, get_run_logger

# The Prefect flow name — deployments are addressed as "<FLOW_NAME>/<deployment-name>".
FLOW_NAME = "run-hobit"


@flow(name=FLOW_NAME, retries=1, retry_delay_seconds=30)
def run_hobit_flow(repository_id: str, hobit_slug: str, force: bool = False) -> dict:
    """Change-gated run of one hobit against one repo. Returns a small JSON-able summary.

    Imports are deferred into the function body so importing this module (which the worker does to
    resolve the entrypoint) is cheap and free of DB/engine side effects until a run actually fires.
    """
    from hobits.core.db import unit_of_work
    from hobits.domain.hobits.services import HobitService

    logger = get_run_logger()
    rid = uuid.UUID(repository_id)
    with unit_of_work() as session:
        result = HobitService(session).run_if_stale(rid, hobit_slug, force=force)
    logger.info(
        "hobit '%s' on %s → %s @ %s",
        hobit_slug,
        repository_id,
        result.status,
        (result.commit_sha or "")[:12],
    )
    return {
        "run_id": str(result.id),
        "status": result.status,
        "commit_sha": result.commit_sha,
    }
