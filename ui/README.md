# Hobits — Frontend (`ui`)

Local **React/Next** web app for Hobits, served at `localhost`. Talks to the `be` FastAPI
backend. Full architecture: [`../docs/architecture.md`](../docs/architecture.md).

## Surfaces

- **The Briefing** — the tiered "what changed / what needs me" digest (P0 now · daily · weekly).
- **The Council** — drop a topic → relevant hobits debate → synthesized recommendation.
- **The Town Hall** — configure hobits, give feedback (thumbs / 1–10 / note), watch
  observability dashboards (tokens, latency, cost, the 3 drifts).

## Stack

- **React / Next** (local web app).
- **Charts** (commit graphs, trends) via a React chart lib — Recharts / visx (decide at build).
- Consumes the `be` REST API.
