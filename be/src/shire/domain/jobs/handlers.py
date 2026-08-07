"""The per-kind completion handler registry.

Only the dispatcher imports this module — it pulls the domain handlers together in one place
without the jobs domain itself depending on any other domain (services.py stays domain-free).
"""

from __future__ import annotations

from collections.abc import Callable

from shire.domain.cicd.jobs import handle_cicd_apply, handle_cicd_scan
from shire.domain.compliance.jobs import handle_compliance_check
from shire.domain.council.jobs import (
    handle_council_chair,
    handle_council_roster,
    handle_council_take_r1,
    handle_council_take_r2,
)
from shire.domain.hobits.jobs import handle_feedback_distill, handle_hobit_run
from shire.domain.jobs import kinds
from shire.domain.jobs.models import JobRow
from shire.domain.merge_review.jobs import (
    handle_mr_classification,
    handle_mr_hobit_review,
    handle_mr_overview,
    handle_mr_principle_check,
)
from shire.domain.news.jobs import handle_news_poll, handle_news_recommend
from shire.domain.principles.jobs import handle_principle_audit
from shire.domain.prompts.jobs import (
    handle_prompt_judge,
    handle_prompt_review,
    handle_prompt_run,
    handle_prompt_suggest,
)
from shire.domain.readiness.jobs import (
    handle_readiness_apply,
    handle_readiness_suggest,
)
from shire.domain.roadmap.jobs import (
    handle_roadmap_drift,
    handle_roadmap_execute,
    handle_roadmap_generate,
)
from shire.domain.substrate.jobs import (
    handle_architecture,
    handle_codebase_overview,
    handle_dependency_ai_scan,
    handle_dependency_gains,
    handle_evolution_note,
    handle_tech_stack,
)
from shire.domain.watchlist.jobs import handle_pulse_summary


def _no_op(job: JobRow) -> None:
    """Kinds whose entire output lives on the job row itself (e.g. repo questions — the
    answer IS the result) need no domain side effects."""


HANDLERS: dict[str, Callable[[JobRow], None]] = {
    kinds.REPO_QUESTION: _no_op,
    kinds.MR_CLASSIFICATION: handle_mr_classification,
    kinds.MR_OVERVIEW: handle_mr_overview,
    kinds.MR_HOBIT_REVIEW: handle_mr_hobit_review,
    kinds.MR_PRINCIPLE_CHECK: handle_mr_principle_check,
    kinds.SUBSTRATE_ARCHITECTURE: handle_architecture,
    kinds.SUBSTRATE_CODEBASE_OVERVIEW: handle_codebase_overview,
    kinds.SUBSTRATE_DEPENDENCY_GAINS: handle_dependency_gains,
    kinds.SUBSTRATE_DEPENDENCY_AI_SCAN: handle_dependency_ai_scan,
    kinds.SUBSTRATE_TECH_STACK: handle_tech_stack,
    kinds.SUBSTRATE_EVOLUTION_NOTE: handle_evolution_note,
    kinds.CICD_SCAN: handle_cicd_scan,
    kinds.CICD_APPLY: handle_cicd_apply,
    kinds.PULSE_SUMMARY: handle_pulse_summary,
    kinds.COMPLIANCE_CHECK: handle_compliance_check,
    kinds.READINESS_SUGGEST: handle_readiness_suggest,
    kinds.READINESS_APPLY: handle_readiness_apply,
    kinds.HOBIT_RUN: handle_hobit_run,
    kinds.HOBIT_FEEDBACK_DISTILL: handle_feedback_distill,
    kinds.COUNCIL_ROSTER: handle_council_roster,
    kinds.COUNCIL_TAKE_R1: handle_council_take_r1,
    kinds.COUNCIL_TAKE_R2: handle_council_take_r2,
    kinds.COUNCIL_CHAIR: handle_council_chair,
    kinds.PRINCIPLE_AUDIT: handle_principle_audit,
    kinds.NEWS_POLL: handle_news_poll,
    kinds.NEWS_RECOMMEND: handle_news_recommend,
    kinds.ROADMAP_GENERATE: handle_roadmap_generate,
    kinds.ROADMAP_EXECUTE: handle_roadmap_execute,
    kinds.ROADMAP_DRIFT: handle_roadmap_drift,
    kinds.PROMPT_REVIEW: handle_prompt_review,
    kinds.PROMPT_SUGGEST: handle_prompt_suggest,
    kinds.PROMPT_RUN: handle_prompt_run,
    kinds.PROMPT_JUDGE: handle_prompt_judge,
}
