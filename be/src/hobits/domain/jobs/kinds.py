"""Job kinds — one constant per Claude invocation type, shared by enqueuers and handlers."""

from __future__ import annotations

MR_CLASSIFICATION = "mr.classification"
MR_OVERVIEW = "mr.overview"
MR_HOBIT_REVIEW = "mr.hobit_review"
SUBSTRATE_ARCHITECTURE = "substrate.architecture"
SUBSTRATE_CODEBASE_OVERVIEW = "substrate.codebase_overview"
SUBSTRATE_DEPENDENCY_GAINS = "substrate.dependency_gains"
HOBIT_RUN = "hobit.run"
