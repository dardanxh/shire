# Vision

> Status: **IDEA / PRODUCT PLANNING** — no tech decisions yet.

## Why this exists

Dardan (staff data engineer) wants a **local-first "companion" / "second brain"** that makes his
job easier. It is a *town* of **hobits** — small, reliable, narrow-domain agents — that watch his
code and systems, reason over them, collaborate, and surface what matters.

The platform must stay **role-agnostic**: expertise lives in hobits (guided by prompting), not in
the core. Everything runs locally, over Claude.

**The bet:** a rich shared understanding of Dardan's actual code + systems, curated ruthlessly and
tuned by his feedback, becomes an indispensable daily companion.

## The product: three surfaces on one substrate

**Substrate — Repo Intelligence** (the north star & foundation). Understands the code and systems
deeply; becomes the shared context every hobit reasons over. See
[`repo-intelligence.md`](./repo-intelligence.md).

Three interaction surfaces stand on it — **only the combination wins**:

1. **The Briefing** — curated "what changed / what needs me today" digest. Push + pull.
2. **The Council** — drop a topic + description → relevant hobits deliberate (and debate) →
   synthesized recommendation, grounded in the substrate.
3. **The Town Hall** — configure hobits, give feedback/scores, watch performance/observability.

A **hobit** = *persona + narrow expertise + tools + memory + autonomy level + feedback loop*. It
persists, learns Dardan's taste, watches its domain, and reports back. See
[`hobits.md`](./hobits.md).

## Guiding principle

> *Thoughtful & quiet > fast & noisy.* The product's real job is deciding what **not** to show
> Dardan.

This emerged consistently from every design choice: debate over panel, curated tiers over feeds,
hybrid control over full automation.

## Non-functional priorities (in order)

1. **Efficiency** (primary) — realized by the "deterministic scanners + LLM-on-deltas" principle
   and by the tiered/curated Briefing (don't compute or show what isn't needed). Enforced by the
   cost/token model in [`scope-people-observability-cost.md`](./scope-people-observability-cost.md).
2. **Scalability** — many hobits × many repos; the event bus + shared substrate must not buckle.
3. **Ease of use** + **perfect UI/UX** — thoughtful & quiet; low-friction feedback; drill-down on
   demand.

## Conceptual build sequencing (idea-level, NOT tech)

Each phase is usable alone and makes the next cheaper.

- **Phase 1 — The Substrate.** Git connect + clone; L1 facts → L2 structure → L3 mental model →
  L4 delta-watch; semantic index; cross-repo system graph. Ships the north star.
  *(Repo-onboarding hobit lives here.)*
- **Phase 2 — First hobits + the Briefing.** Hobit engine (anatomy, lifecycle, 4-tier memory); a
  few domain hobits; self-scoring; tiered Briefing; feedback loop → editable lessons.
  *(News/informer hobit proves the scheduled-watcher model.)*
- **Phase 3 — The town coordinates.** Event bus + blackboard; the Council (debate + synthesizer,
  hybrid roster); inter-hobit messaging; devil's-advocate mode.
- **Phase 4 — The companion.** Calendar/email awareness; people graph; meeting prep;
  observability dashboards (3 drifts, tokens, latency); global-config polish.

## What's parked

Tech stack, agent runtime, orchestration, persistence, UI, and deployment are deliberately
deferred. See [`NEXT-STEPS.md`](./NEXT-STEPS.md) — each is tagged **TBD**.
