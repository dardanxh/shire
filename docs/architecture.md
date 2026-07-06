# Architecture (Decided)

> The idea is documented in the other docs. This file records the **agreed technical
> architecture**. Guiding constraints from the vision: **local-first** (data stays on Dardan's
> machine), **efficiency #1**, **scalability**, **perfect UI/UX**, **full control**, and
> **simplicity** — built around **Claude only** (how Dardan works, personally and at work).

## Hosting model — LOCAL-FIRST, CLAUDE-ONLY

Everything runs on Dardan's machine; **Claude is the sole LLM engine** (inference only). Repos,
memory, and all data stay local (Postgres). We deliberately chose **simplicity over
model-agnosticism** — no LiteLLM, no multi-provider layer, no local OSS models. We borrow the
*design patterns* of Anthropic's Managed Agents (CMA) but do not host on it.

> **Why not Managed Agents?** CMA's primitives map almost 1:1 onto the vision (Agent=hobit,
> Session=run, Deployments=schedule, Memory Stores=memory, Multiagent=Council, GitHub
> resources=repo intel, spans=observability) — but it is cloud-hosted (agent loop + repos +
> memory on Anthropic infra), which conflicts with the local-first requirement.

## The engine — Claude Code (Max subscription, $0)

Each hobit **is a configured Claude agent**. Two auth modes sit behind one thin `ClaudeAgent`
wrapper, so hobit definitions are identical either way:

- **Primary — Claude Code headless CLI (`claude -p`) on the Max subscription → $0.** Authenticate
  once with `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN`; each run draws on the Max quota.
  Fully scriptable (`--output-format json`, `--allowedTools`, `--permission-mode`, `--model`).
  Claude Code **runs the agentic tool loop natively** (bash / read / grep / web over the cloned
  repos) — ideal for the repo-intelligence and Council hobits.
- **Alternative — Claude Agent SDK + API key → paid.** A cleaner programmatic interface (pay-as-
  you-go). Same hobit definitions; drop in later (e.g. at work with an API budget, or if Max
  fair-use bites) with **no rewrite**.

> Verified (code.claude.com docs, 2026-07): the **Claude Agent SDK** and the **raw Messages API**
> require a pay-as-you-go **API key** — they cannot use a subscription. The **`claude -p` headless
> CLI is the only $0-on-Max path**, and it is fully scriptable as a subprocess.

**Caveats (design around these):**
- **Fair-use / ToS:** Max limits "assume ordinary, individual usage." A 24/7 fleet of many
  autonomous hobits may hit rate limits or be treated as commercial; a **June 2026** change routes
  *autonomous* (non-interactive) usage to a separate credit pool. → **$0 is realistic for
  personal/dev/moderate cadence; not guaranteed for a large continuous fleet.** Mitigate: keep
  high-frequency work on the cheapest Claude model (Haiku) and keep cadence moderate.
- **`claude -p` is the Claude Code *harness*, not a chat endpoint** — a "call" spawns an agent
  with its own tools (heavier per call, but ideal for repo exploration). The hobit defines its
  charter / task / output-schema abstractly; the `ClaudeAgent` wrapper renders it into a CLI
  invocation (parse the JSON out) or an Agent-SDK call.

## The stack

| Layer | Choice | Notes |
| --- | --- | --- |
| **Language** | **Python** | Dardan's home turf; best git/data libs. |
| **LLM engine** | **Claude Code** (`claude -p` on Max sub, $0; Agent SDK + API key as paid alt) | Single provider = Claude. Claude Code runs the tool loop natively. Thin `ClaudeAgent` wrapper over both auth modes. |
| **Orchestration** | **Prefect** | Schedules + **event automations** (agent→agent triggers) + on-demand + retries + run-history UI. Backs onto Postgres — **no Redis**. |
| **Persistence** | **Postgres + pgvector** | One store: hobit configs, 4-tier memory, blackboard/threads, event log, substrate facts, **semantic code index (embeddings)**. |
| **Embeddings** | **Local model** (sentence-transformers / BGE-class) via pgvector | The one unavoidable non-Claude piece (Claude has no embeddings endpoint). It's just the search index — $0, local, not a second "model provider". |
| **Substrate scanners** | GitPython / pydriller (stats), tree-sitter (structure), dependency parsers | Deterministic, cheap, continuous. Claude only for L3 narrative + on deltas. |
| **Event bus + blackboard** | Postgres (`LISTEN/NOTIFY` + tables) + Prefect event automations | Stays local, no broker. |
| **Backend API** | **FastAPI** (async) | Serves the UI + drives Prefect + the `ClaudeAgent` hobits. |
| **UI** | **Local web app — React/Next + FastAPI** | Richest UX for commit charts, topic workspaces, feedback, dashboards. `localhost`, fully local. |
| **Observability / metrics** | **Postgres + TimescaleDB** | Time-series (tokens, latency, cost) + relational + vector in ONE store; joins with hobit/feedback data. **Grafana**-ready (add later). Derive all 3 drifts from the same tables. |

## Repository layout (monorepo)

| Path | What |
| --- | --- |
| `be/` | Backend — Python (FastAPI), Prefect, Postgres+pgvector+TimescaleDB, `ClaudeAgent` engine, substrate scanners. |
| `ui/` | Frontend — local React/Next web app (Briefing · Council · Town Hall), talks to the `be` API. |
| `docs/` | Vision + architecture. |

Single repo, no submodules; `be` and `ui` are plain directories. See each dir's `README.md`.

## Model tiering (cost NFR) — all Claude

Model per hobit via `--model`. On the subscription, cheaper models burn less quota — so tiering
is also the main fair-use lever.

| Tier | Claude model | Used for |
| --- | --- | --- |
| Grunt | **Haiku** | Classification, relevance-filter, fact extraction, KISS summaries. High-frequency → cheapest. |
| Standard | **Sonnet** | Normal hobit reasoning, light tool use. |
| Deep | **Opus** | Council debate + synthesis, tool-heavy hobits, hardest analysis. |

**Cost levers** (from day one): model tiering (keep grunt on Haiku); **prompt caching** on the
stable substrate/charter prefix (biggest lever); **deterministic-first + delta-only** (never
re-read a whole repo); batch/low-urgency work into fewer, larger runs; **self-score gate** (cheap
relevance pass before deep reasoning). Global default model + per-hobit override.

## How each vision concept maps to a component

- **Hobit** → a config row (persona/charter/exemplars/tools/model/autonomy) + a **Prefect flow**
  running a **`ClaudeAgent`** through its lifecycle (wake → load context → work → self-critique →
  self-score → emit → distill).
- **4-tier memory** → Postgres tables (working=ephemeral run state; episodic/semantic/lessons =
  persisted, prunable). Shared "town facts" = shared tables; private lessons = per-hobit rows.
- **Coordination fabric** → Postgres blackboard threads (Council topics, findings) + event bus =
  Postgres `NOTIFY` + **Prefect event automations** (one hobit's finding triggers another's flow).
  Direct asks = a targeted thread + triggered flow.
- **The Council** → a parent **Prefect flow** fanning out to per-hobit `ClaudeAgent`s for the
  debate rounds, then a synthesizer agent.
- **Repo Intelligence** → deterministic scanners write L1/L2 facts to Postgres; a Claude hobit
  writes L3 narrative (Claude Code explores the cloned repo directly); pgvector holds the semantic
  index; a delta-watcher flow emits L4 events to the Briefing.
- **Briefing (tiered)** → self-scores gate what surfaces; P0 → native notification; daily/weekly
  → digests rendered in the UI.
- **Feedback loop** → thumbs/1–10/note persisted → distilled into the editable "lessons" rows →
  injected into the charter each run.
- **Observability + 3 drifts** → per-run usage/latency/cost time-series in **TimescaleDB**;
  preference drift (score trend), scope drift (charter-adherence check), staleness drift (facts
  vs substrate). **Grafana** on top when wanted.

## Remaining minor decisions (safe defaults, revisit at build time)

- **Git connectors:** GitHub/GitLab/Bitbucket REST APIs + local `git clone`. Calendar/email via
  Google APIs (Phase 4).
- **Charting:** a React chart lib (e.g. Recharts/visx) — decide at UI build.
- **Single-user, local:** minimal/no auth; bind to `localhost`.

## Optional future

- **Paid/scale path:** swap any hobit from the `claude -p` (Max) auth mode to the **Claude Agent
  SDK + API key** with no rewrite (e.g. at work, or if Max fair-use bites).
- **Model-agnostic later:** if ever needed, the `ClaudeAgent` seam is where an alternate provider
  could be reintroduced — explicitly out of scope for now (simplicity).
