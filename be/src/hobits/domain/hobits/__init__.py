"""Hobits bounded context — the agent engine.

A *hobit* is a narrow-domain Claude agent: a code template (charter + run logic, in the registry)
with user-editable config (model, charter, limits) persisted as overrides. A *run* targets one
repository, drives `claude -p` through its lifecycle (wake → load context → work → self-score →
emit), and produces an L3 narrative + a self-scored briefing item. First hobit: Repo-Onboarding.
"""
