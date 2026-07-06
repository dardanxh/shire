# Architecture (Decided)

> The idea is documented in the other docs. This file records the **agreed technical
> architecture**. Guiding constraints carried in from the vision: **local-first** (data stays on
> Dardan's machine), **efficiency #1**, **scalability**, **perfect UI/UX**, **full control**.

## Hosting model — LOCAL-FIRST CUSTOM

Everything runs on Dardan's machine; an **LLM API is used for inference only** — and it is
**model-agnostic** (any cloud or local open-source model, via LiteLLM). Repos, memory, and all
data stay local (Postgres). We borrow the *design patterns* of Anthropic's Managed Agents (CMA)
but do not host on it.

> **Why not Managed Agents?** CMA's primitives map almost 1:1 onto the vision (Agent=hobit,
> Session=run, Deployments=schedule, Memory Stores=memory, Multiagent=Council, GitHub
> resources=repo intel, spans=observability) — but it is cloud-hosted (agent loop + repos +
> memory on Anthropic infra), which conflicts with the local-first requirement. Kept as an
> optional later escape hatch for specific cloud-run hobits (see Hybrid note at bottom).

## The stack

| Layer | Choice | Notes |
| --- | --- | --- |
| **Language** | **Python** | Dardan's home turf; best git/data libs. |
| **LLM gateway** | **LiteLLM** | Model-agnostic: one interface to any model — cloud (Claude/GPT/Gemini) **and local OSS via Ollama/vLLM**. Unified cost tracking, fallbacks, caching. Model per hobit = config. |
| **Agent / tool-calling** | **Pydantic AI** | Standard, typed, model-agnostic framework for tool-calling + structured outputs — we don't hand-roll the loop. Drives models through LiteLLM; pairs with FastAPI/Pydantic. |
| **Orchestration** | **Prefect** | Schedules + **event-driven automations** (agent→agent triggers) + on-demand runs + retries + run-history UI. Backs onto Postgres — **no Redis**. Hobit-run function is engine-agnostic (easy to swap). |
| **Persistence** | **Postgres + pgvector** | One store: hobit configs, 4-tier memory, blackboard/threads, event log, substrate facts, **semantic code index (embeddings)**. |
| **Embeddings** | **Local model** (sentence-transformers / BGE-class) via pgvector | No per-token cost, no code leaves the machine. |
| **Substrate scanners** | GitPython / pydriller (stats), tree-sitter (structure), dependency parsers | Deterministic, cheap, continuous. LLM only for L3 narrative + on deltas. |
| **Event bus + blackboard** | Postgres (`LISTEN/NOTIFY` + tables) + Prefect event automations | Stays local, no broker. |
| **Backend API** | **FastAPI** (async) | Serves the UI + drives Prefect + Pydantic AI hobits. |
| **UI** | **Local web app — React/Next + FastAPI** | Richest UX for commit charts, topic workspaces, feedback, dashboards. `localhost`, fully local. |
| **Observability / metrics** | **Postgres + TimescaleDB** | Time-series (tokens, latency, € cost) + relational + vector in ONE store; joins with hobit/feedback data. **Grafana** reads it natively (add later). Derive all 3 drifts from the same tables. |

## Model tiering (cost NFR) — model-agnostic

Any model per hobit (config), via LiteLLM. A representative tiering:

| Tier | Example model | Used for | Notes |
| --- | --- | --- | --- |
| Local grunt | **Ollama OSS** (e.g. Llama/Qwen) | Classification, relevance-filter, fact extraction, KISS summaries (**no tools**). | Free + offline. Small local models are weakest at tool-calling — keep tools off this tier. |
| Standard | mid cloud (e.g. Sonnet-class) | Normal hobit reasoning, light tool use. | |
| Deep | top cloud (e.g. Opus-class) | Council debate + synthesis, tool-heavy hobits, hardest analysis. | Tool-calling reliability matters here. |

**Cost levers** (implement from day one): the **local grunt tier** is the ultimate lever (free);
**LiteLLM cost tracking + fallbacks + caching** across providers; **prompt caching** passed
through to providers that support it (biggest lever on the stable substrate/charter prefix);
**batching** low-urgency work (weekly roundup); **structured outputs** (Pydantic AI) for
self-scores/findings; **token counting** for €-budget enforcement. Global default model +
per-hobit override.

> **Tradeoff of model-agnosticism:** provider-specific perks (Anthropic prompt caching, batch
> API, adaptive thinking) become *provider extras* rather than the backbone — LiteLLM carries the
> common levers and passes native features through where present. Design to the common interface;
> reach for provider extras where they matter.

## How each vision concept maps to a component

- **Hobit** → a config row (persona/charter/exemplars/tools/model/autonomy) + a **Prefect flow**
  running a **Pydantic AI agent** through its lifecycle (wake → load context → work →
  self-critique → self-score → emit → distill).
- **4-tier memory** → Postgres tables (working=ephemeral run state; episodic/semantic/lessons =
  persisted, prunable). Shared "town facts" = shared tables; private lessons = per-hobit rows.
- **Coordination fabric** → Postgres blackboard threads (Council topics, findings) + event bus =
  Postgres `NOTIFY` + **Prefect event automations** (one hobit's finding triggers another's flow).
  Direct asks = a targeted thread + triggered flow.
- **The Council** → a parent **Prefect flow** fanning out to per-hobit Pydantic AI agents for the
  debate rounds, then a synthesizer agent. (A Pydantic AI multi-agent orchestration also fits.)
- **Repo Intelligence** → deterministic scanners write L1/L2 facts to Postgres; an LLM hobit
  writes L3 narrative; pgvector holds the semantic index; a delta-watcher flow emits L4 events to
  the Briefing.
- **Briefing (tiered)** → self-scores gate what surfaces; P0 → native notification; daily/weekly
  → digests rendered in the UI.
- **Feedback loop** → thumbs/1–10/note persisted → distilled into the editable "lessons" rows →
  injected into the charter each run.
- **Observability + 3 drifts** → per-run usage/latency/€ time-series in **TimescaleDB**;
  preference drift (score trend), scope drift (charter-adherence check), staleness drift (facts
  vs substrate). **Grafana** on top when wanted.

## Remaining minor decisions (safe defaults, revisit at build time)

- **Git connectors:** GitHub/GitLab/Bitbucket REST APIs + local `git clone` (not MCP, to stay
  local). Calendar/email via Google APIs (Phase 4).
- **Charting:** a React chart lib (e.g. Recharts/visx) — decide at UI build.
- **Single-user, local:** minimal/no auth; bind to `localhost`.

## Optional future hybrid

If specific hobits later need cloud scale or Anthropic-hosted tooling, CMA can run *those*
hobits (scheduled deployments / multiagent Council) while the local core remains the system of
record. Not needed for v1.
