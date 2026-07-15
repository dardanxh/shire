"""The per-kind completion handler registry.

Only the dispatcher imports this module — it pulls the domain handlers together in one place
without the jobs domain itself depending on any other domain (services.py stays domain-free).
"""

from __future__ import annotations

from collections.abc import Callable

from hobits.domain.hobits.jobs import handle_hobit_run
from hobits.domain.jobs import kinds
from hobits.domain.jobs.models import JobRow
from hobits.domain.merge_review.jobs import (
    handle_mr_classification,
    handle_mr_hobit_review,
    handle_mr_overview,
)
from hobits.domain.principles.jobs import handle_principle_audit
from hobits.domain.substrate.jobs import (
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
    kinds.PRINCIPLE_AUDIT: handle_principle_audit,
}
