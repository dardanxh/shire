# Hobits — Backend (`be`)

Python backend for Hobits. Full architecture: [`../docs/architecture.md`](../docs/architecture.md).

## Stack

- **Python + FastAPI** (async API serving the `ui` + driving hobit runs).
- **Prefect** — schedules + event-driven automations (agent→agent triggers) + on-demand runs;
  Postgres-backed, **no Redis**.
- **Postgres + pgvector** — hobit configs, 4-tier memory, blackboard/threads, event log,
  substrate facts, semantic code index (embeddings). **TimescaleDB** for metrics.
- **`ClaudeAgent` engine** — each hobit is a Claude agent. Primary: `claude -p` headless CLI on
  the Max subscription ($0). Alt: Claude Agent SDK + API key (paid, same definitions).
- **Substrate scanners** — GitPython / pydriller (stats), tree-sitter (structure), dependency
  parsers. Deterministic + delta-only; Claude only for L3 narrative + on deltas.
- **Local embeddings** (sentence-transformers / BGE-class) for the semantic index.

## Planned layout (indicative — filled in during build)

```
be/
  app/            # FastAPI app + routes
  hobits/         # ClaudeAgent, run lifecycle, roster/config
  substrate/      # scanners, mental-model, semantic index (repo intelligence)
  orchestration/  # Prefect flows + event automations
  memory/         # 4-tier memory (working/episodic/semantic/lessons)
  coordination/   # blackboard threads + event bus (Postgres NOTIFY)
  db/             # models, migrations
  observability/  # usage/latency/cost + drift metrics (Timescale)
```
