# Repo Intelligence — The Substrate

> The **north star** and foundation. It is the shared context every hobit reasons over. Get the
> substrate rich enough and the Briefing + Council get dramatically easier, because hobits reason
> over *real, structured knowledge about actual code* instead of thin air.

## Four layers (cheapest / most-objective at the bottom)

- **L1 — Facts** (deterministic, cheap, continuous): age, commit count, contributors, LOC by
  language, commits/day charts, dependency inventory + versions, CI/CD detection, license, test
  presence, branch/PR activity. *No LLM needed.* The skeleton.
- **L2 — Structure** (semi-deterministic): architecture map, module boundaries, internal
  dependency graph, **data-flow shape** (sources → transforms → sinks), hotspots
  (churn × complexity = risk zones), ownership.
- **L3 — Narrative** (LLM, selective): per-repo "mental model" doc — what it does, how it's
  organized, the ~5 files that matter, the scary parts, conventions. Generated once,
  **delta-refreshed**.
- **L4 — Living memory** (temporal): watches deltas over time (merge added complexity, dep
  flagged, coverage dropped, new sink). These deltas feed the Briefing.

## Agreed decisions

- **Depth: DEEP.** Full mental model + data-flow / lineage map + a **semantic code index** so
  Dardan and hobits can ask "where does X happen?" and get grounded answers. Kept affordable via
  delta-refresh.
- **Breadth: CROSS-REPO from day one.** Repos are nodes in one **system graph**; shared-lib bumps
  ripple across repos; lineage crosses repo boundaries. Staff/system altitude, not file-by-file.
- **DE lens: GENERIC substrate, DE smarts as hobits.** The core understands code + systems
  generically; pipeline / idempotency / backfill / cost intelligence lives in hobits on top. This
  keeps the core **role-agnostic** (a stated goal).

## Efficiency principle (NFR #1)

> **Deterministic scanners do the heavy, continuous lifting for free; LLMs are invoked only on
> deltas.** Never re-read a whole repo daily.

L1–L2 recompute cheaply and constantly. L3–L4 only wake an LLM when something *actually changed
and matters*. This is what makes "many hobits watching many repos" affordable instead of a token
bonfire.

## Multi-git sourcing

Connect **GitHub / GitLab / Bitbucket**; clone selected repos locally; run the substrate over the
local clones.

## How it feeds the other surfaces

- **→ Briefing:** the L4 delta-watcher is the primary source of "what changed / what needs me"
  (malicious dep, complexity spike, cost regression, coverage drop).
- **→ Council:** when Dardan drops a topic, hobits ground their opinions in the substrate — the
  idempotency hobit reads the actual pipeline structure, the cost hobit reads real data volumes
  and formats. Grounded advice, not generic.
