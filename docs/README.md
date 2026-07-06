# Hobits — Documentation

> **Status: VISION + ARCHITECTURE DECIDED — pre-build.** These docs capture *what* we're building
> and *why* (vision), plus the *how* ([`architecture.md`](./architecture.md)). No code has been
> written yet; implementation begins when Dardan says go.

## The pitch (one paragraph)

**Hobits** is a local-first, Claude-powered *companion* / *second brain* for a staff data
engineer. It's a **town of hobits** — small, reliable, narrow-domain expert agents — standing on
a deep **cross-repo intelligence substrate**. The hobits watch your code and systems, deliberate
with each other, and surface *only what matters* through a calm, tiered briefing — continuously
tuned by your feedback. The core stays **role-agnostic**: all expertise lives in hobits you
configure via prompting, not baked into the platform. Everything runs locally, over Claude.

**Guiding principle:** *thoughtful & quiet > fast & noisy.* The product's real job is deciding
what **not** to show you.

## How to read these docs

| Doc | What's inside |
| --- | --- |
| [`vision.md`](./vision.md) | The product idea: three surfaces on one substrate, NFRs, build sequencing (Phases 1–4). |
| [`repo-intelligence.md`](./repo-intelligence.md) | The substrate (north star): L1–L4 layers, depth/breadth/DE-lens, efficiency principle. |
| [`hobits.md`](./hobits.md) | The hobit as an entity: anatomy, run lifecycle, 4-tier memory, feedback, autonomy. |
| [`coordination.md`](./coordination.md) | How the town coordinates: blackboard + event bus, the Council, the Briefing. |
| [`scope-people-observability-cost.md`](./scope-people-observability-cost.md) | Scope, people graph, observability (3 drifts), global config, cost/token controls. |
| [`hobit-roster.md`](./hobit-roster.md) | The committed + seed roster of hobits (user-extensible by design). |
| [`architecture.md`](./architecture.md) | **Decided** technical architecture: the stack, model tiering, and how each concept maps to a component. |
| [`NEXT-STEPS.md`](./NEXT-STEPS.md) | The five tech decisions (now resolved) + the feature backlog. |

## The three surfaces (at a glance)

1. **The Briefing** — curated "what changed / what needs me today" digest (tiered: now / daily / weekly).
2. **The Council** — drop a topic → relevant hobits debate → a synthesized, grounded recommendation.
3. **The Town Hall** — configure hobits, give feedback/scores, watch performance & observability.

...all standing on the **Repo Intelligence substrate** (the shared context every hobit reasons over).
