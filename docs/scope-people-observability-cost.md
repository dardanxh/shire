# Scope, People, Observability, Config & Cost

## Scope — WORK + CALENDAR/EMAIL

Engineering core (repos, pipelines, news, cost, quality, topics) **plus awareness of Dardan's
day** — read calendar to prep meetings, scan email for what needs him ("talk to X before the 2pm
sync"). This is what makes the Monday-morning story real.

*(Full personal PKM / quick-capture is parked for later — see [`NEXT-STEPS.md`](./NEXT-STEPS.md).)*

## People graph — LIGHT start

Just enough to power "talk to X about Y": **name, role, their expertise/ownership, Dardan's
relationship** to them (report-to / peer / stakeholder). Hobits reference it to close the loop from
*insight* to *action* ("the pipeline merge added complexity — **talk to Maria, she owns that
DAG**"). Also powers meeting prep.

> **Privacy:** this is sensitive data about colleagues — it stays **100% local, never leaves the
> machine.** *(Interaction-history enrichment can come later.)*

## Observability — track all three drifts

Plus the specified per-run I/O logging, latency, tokens, and per-hobit performance:

- **Preference drift** — output stops matching Dardan's taste (thumbs/scores trending down).
- **Scope drift** — a hobit wanders off its charter (the cost hobit starts opining on security).
- **Staleness drift** — a hobit's understanding of a repo falls behind the actual substrate.

## Global config

One place to set the town's baseline: **models** (per-role + default), **tone of discussion**, and
platform-wide **defaults** (default autonomy, retention depth, Briefing thresholds).

## Cost / token-budget controls (enforcement arm of efficiency NFR #1)

1. **Model tiering by task difficulty** — cheap/fast model for grunt work (scan, classify,
   relevance-filter, fact-extract, KISS summaries); mid-tier for normal reasoning; top-tier only
   for Council debate/synthesis. Global default + per-hobit override.
2. **Deterministic-first** — no LLM where plain code suffices (the substrate rule).
3. **Delta-only** — daily cost ∝ what changed, not repo size.
4. **Escalation ladder** — a cheap relevance pass gates the expensive one; escalate to a bigger
   model only if the cheap pass says it's worth it. Stops every run doing full-depth analysis.
5. **Budgets & caps** — per-hobit daily/weekly token-or-€ budget + town-wide ceiling; graceful
   degradation on cap (skip low-value / queue to tomorrow), never blow the budget.
6. **Caching + batching** — cache stable context (substrate slice + charter) across runs; batch
   low-urgency work (the weekly roundup) into fewer, larger calls.

**Meta touch:** the **cost hobit watches the platform's OWN spend** and surfaces budget anomalies
right in the Briefing ("your news hobit's budget is trending 3× — worth checking"). The
observability layer already tracks tokens, so adding € estimates + budget alerts is natural.
