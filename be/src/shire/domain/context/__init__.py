"""Context bounded context: the per-repo semantic context pack.

A precomputed, agent-ready projection over the substrate. It folds a repository's latest analysis
(facts, enrichment, ratings, people, structure) plus its cached visualization artifacts into a
single document — the first-read context layer for AI agents, so they don't fan out across a dozen
endpoints. Deterministic (no LLM, no embeddings); the `narrative` field is a reserved L3 slot.
"""
