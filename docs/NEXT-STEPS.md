# Next Steps

> The **idea phase is documented** (see the other docs in this folder). The decisions below are
> deliberately **parked** — no implementation choice has been made. Each is tagged **TBD** and
> will be discussed **ASAP** in a dedicated tech-stack & architecture session.

## TBD — to discuss ASAP

### 1. Tech-stack & architecture — **TBD**
Overall shape of the system: backend language(s), how the substrate, hobit engine, coordination
fabric, and surfaces fit together. Candidate directions discussed briefly (Python-leaning, given
the data-engineering context) but **not decided**.

### 2. Agent runtime — **TBD**
How hobits actually execute. Options floated: **Claude Agent SDK** (tool loops, subagents, MCP,
context compaction, hooks) vs. a **custom loop on the raw Anthropic API** vs. a graph framework
(e.g. LangGraph). **Not decided.**

### 3. Orchestration — **TBD**
What drives periodic + event-triggered hobit runs (the schedules + the pub/sub event bus).
Options floated: **Dagster**, **Prefect**, **Temporal**, or a lightweight in-app scheduler.
**Not decided.**

### 4. Persistence — **TBD**
How state, memory, and the substrate are stored. Postgres was named as a preference in the brief;
still open: how the 4-tier memory, the semantic/embedding index, the blackboard/threads, and the
event log are modeled. **Not decided.**

### 5. UI — **TBD**
The day-to-day surface (the Briefing / Council / Town Hall). Options floated: **local web app**,
**desktop (Tauri)**, or **TUI-first**. Must serve "perfect UI/UX" while staying local. **Not
decided.**

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
