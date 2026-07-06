# Next Steps

> The **idea phase** and the **technical architecture** are now documented. The five topics below
> are **DECIDED** — see [`architecture.md`](./architecture.md) for the full stack, rationale, and
> how each vision concept maps to a component.

## DECIDED (see architecture.md)

1. **Tech-stack & architecture** — ✅ **Local-first custom**: Python; data stays on-machine;
   Claude API for inference only; borrow Managed Agents *patterns* but don't host on it.
2. **Agent runtime** — ✅ **Model-agnostic**: **LiteLLM** gateway (any cloud/local-OSS model via
   Ollama) + **Pydantic AI** for standard tool-calling & structured outputs (don't hand-roll the
   loop). Tiering: local-OSS grunt (no tools) → mid cloud → top cloud (tool-heavy/Council).
3. **Orchestration** — ✅ **Prefect** (schedules + event automations = inter-hobit triggers +
   on-demand + retries + run-history UI; Postgres-backed, **no Redis**).
4. **Persistence** — ✅ **Postgres + pgvector** (one store: configs, 4-tier memory, blackboard,
   event log, substrate facts, semantic index). **Local embeddings** model.
5. **UI** — ✅ **Local web app (React/Next + FastAPI)**. Observability/metrics: **Postgres +
   TimescaleDB** (Grafana-ready later).

## Remaining minor decisions (safe defaults; revisit at build time)

- Git connectors (REST + local clone), charting lib, single-user/local auth — see
  [`architecture.md`](./architecture.md) → "Remaining minor decisions".

---

## Cross-cutting concerns to carry into the architecture session

- **Efficiency (NFR #1)** must be designed in, not bolted on — the "deterministic-first +
  LLM-on-deltas" principle and the six-lever cost model
  ([`scope-people-observability-cost.md`](./scope-people-observability-cost.md)) constrain runtime
  + orchestration + persistence choices.
- **Local-first / privacy** — everything runs on Dardan's machine; the people graph never leaves
  it. This constrains persistence + any external integrations.
- **Observability** — per-run I/O, latency, tokens, and the three drifts must be first-class in
  whatever runtime + persistence we pick.
- **Scalability** — many hobits × many repos; the event bus + shared substrate must not buckle.

## Feature backlog (proposed, NOT committed)

PR/code-review companion · decision journal (ADR assistant) · quick-capture inbox · career/growth
hobit · "explain the diff" watcher · weekly retro · cross-repo ripple/system-view enrichment ·
interaction-history on the people graph · auto-promotion "trust ladder".
