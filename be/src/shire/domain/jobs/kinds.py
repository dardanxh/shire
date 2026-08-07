"""Job kinds — one constant per Claude invocation type, shared by enqueuers and handlers."""

from __future__ import annotations

MR_CLASSIFICATION = "mr.classification"
MR_OVERVIEW = "mr.overview"
MR_HOBIT_REVIEW = "mr.hobit_review"
MR_PRINCIPLE_CHECK = "mr.principle_check"
SUBSTRATE_ARCHITECTURE = "substrate.architecture"
SUBSTRATE_CODEBASE_OVERVIEW = "substrate.codebase_overview"
SUBSTRATE_DEPENDENCY_GAINS = "substrate.dependency_gains"
SUBSTRATE_DEPENDENCY_AI_SCAN = "substrate.dependency_ai_scan"
SUBSTRATE_TECH_STACK = "substrate.tech_stack"
CICD_SCAN = "cicd.scan"
CICD_APPLY = "cicd.apply"
SUBSTRATE_EVOLUTION_NOTE = "substrate.evolution_note"
PULSE_SUMMARY = "watchlist.pulse_summary"
COMPLIANCE_CHECK = "compliance.check"
READINESS_SUGGEST = "readiness.suggest"
READINESS_APPLY = "readiness.apply"
HOBIT_RUN = "hobit.run"
HOBIT_FEEDBACK_DISTILL = "hobit.feedback_distill"
COUNCIL_ROSTER = "council.roster"
COUNCIL_TAKE_R1 = "council.take_r1"
COUNCIL_TAKE_R2 = "council.take_r2"
COUNCIL_CHAIR = "council.chair"
REPO_QUESTION = "repo.question"
PRINCIPLE_AUDIT = "principle.audit"
NEWS_POLL = "news.poll"
NEWS_RECOMMEND = "news.recommend"
ROADMAP_GENERATE = "roadmap.generate"
ROADMAP_EXECUTE = "roadmap.execute"
ROADMAP_DRIFT = "roadmap.drift"
PROMPT_REVIEW = "prompt.review"
PROMPT_SUGGEST = "prompt.suggest"
PROMPT_RUN = "prompt.run"
PROMPT_JUDGE = "prompt.judge"

# Models the engine's `claude` CLI accepts: aliases (track the latest version) plus pinned
# IDs for reproducibility. Curated here so the Config tab's dropdown has one place to update.
AVAILABLE_MODELS = (
    "sonnet",
    "opus",
    "haiku",
    "claude-opus-5",
    "claude-sonnet-5",
    "claude-opus-4-8",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
)
