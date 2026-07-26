"""Job kinds — one constant per Claude invocation type, shared by enqueuers and handlers."""

from __future__ import annotations

MR_CLASSIFICATION = "mr.classification"
MR_OVERVIEW = "mr.overview"
MR_HOBIT_REVIEW = "mr.hobit_review"
SUBSTRATE_ARCHITECTURE = "substrate.architecture"
SUBSTRATE_CODEBASE_OVERVIEW = "substrate.codebase_overview"
SUBSTRATE_DEPENDENCY_GAINS = "substrate.dependency_gains"
SUBSTRATE_TECH_STACK = "substrate.tech_stack"
COMPLIANCE_CHECK = "compliance.check"
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

# Models the engine's `claude` CLI accepts: aliases (track the latest version) plus pinned
# IDs for reproducibility. Curated here so the Config tab's dropdown has one place to update.
AVAILABLE_MODELS = (
    "sonnet",
    "opus",
    "haiku",
    "claude-sonnet-4-6",
    "claude-opus-4-8",
    "claude-haiku-4-5",
)
