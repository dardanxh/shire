"""The per-kind completion handler registry.

Only the dispatcher imports this module — it pulls the domain handlers together in one place
without the jobs domain itself depending on any other domain (services.py stays domain-free).
"""

from __future__ import annotations

from collections.abc import Callable

from shire.domain.hobits.jobs import handle_feedback_distill, handle_hobit_run
from shire.domain.jobs import kinds
from shire.domain.jobs.models import JobRow
from shire.domain.merge_review.jobs import (
    handle_mr_classification,
    handle_mr_hobit_review,
    handle_mr_overview,
)
from shire.domain.news.jobs import handle_news_poll, handle_news_recommend
from shire.domain.principles.jobs import handle_principle_audit
from shire.domain.roadmap.jobs import (
    handle_roadmap_drift,
    handle_roadmap_execute,
    handle_roadmap_generate,
)
from shire.domain.substrate.jobs import (
    handle_architecture,
    handle_codebase_overview,
    handle_dependency_gains,
)


def _no_op(job: JobRow) -> None:
    """Kinds whose entire output lives on the job row itself (e.g. repo questions — the
    answer IS the result) need no domain side effects."""


HANDLERS: dict[str, Callable[[JobRow], None]] = {
    kinds.REPO_QUESTION: _no_op,
    kinds.MR_CLASSIFICATION: handle_mr_classification,
    kinds.MR_OVERVIEW: handle_mr_overview,
    kinds.MR_HOBIT_REVIEW: handle_mr_hobit_review,
    kinds.SUBSTRATE_ARCHITECTURE: handle_architecture,
    kinds.SUBSTRATE_CODEBASE_OVERVIEW: handle_codebase_overview,
    kinds.SUBSTRATE_DEPENDENCY_GAINS: handle_dependency_gains,
    kinds.HOBIT_RUN: handle_hobit_run,
    kinds.HOBIT_FEEDBACK_DISTILL: handle_feedback_distill,
    kinds.PRINCIPLE_AUDIT: handle_principle_audit,
    kinds.NEWS_POLL: handle_news_poll,
    kinds.NEWS_RECOMMEND: handle_news_recommend,
    kinds.ROADMAP_GENERATE: handle_roadmap_generate,
    kinds.ROADMAP_EXECUTE: handle_roadmap_execute,
    kinds.ROADMAP_DRIFT: handle_roadmap_drift,
}
