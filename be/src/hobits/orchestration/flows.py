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

# The global news-poll flow/deployment (one deployment total, not one per topic).
NEWS_FLOW_NAME = "news-poll"


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


@flow(name=NEWS_FLOW_NAME, retries=1, retry_delay_seconds=30)
def run_news_poll_flow() -> dict:
    """One scheduled news tick: enqueue a poll job per enabled topic (topics with a run already
    in flight are skipped). The engine does the actual fetching — this returns in milliseconds."""
    from hobits.core.db import unit_of_work
    from hobits.domain.news.services import NewsService

    logger = get_run_logger()
    with unit_of_work() as session:
        polls = NewsService(session).poll_all(trigger="scheduled")
    logger.info("news poll → %d topic job(s) enqueued", len(polls))
    return {"topics_enqueued": len(polls)}
