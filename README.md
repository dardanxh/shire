# Hobits

A **local-first, Claude-powered "second brain" / companion** — a *town* of narrow-domain expert
agents ("hobits") standing on a cross-repo intelligence substrate. They watch your code and
systems, deliberate, and surface only what matters, tuned by your feedback.

See [`docs/`](./docs) for the full vision and the decided architecture — start at
[`docs/README.md`](./docs/README.md).

## Monorepo layout

| Path | What |
| --- | --- |
| [`be/`](./be) | **Backend** — Python (FastAPI), Prefect orchestration, Postgres + pgvector + TimescaleDB, the `ClaudeAgent` hobit engine, substrate scanners. |
| [`ui/`](./ui) | **Frontend** — local React/Next web app (Briefing · Council · Town Hall), talks to the `be` API. |
| [`docs/`](./docs) | Vision + architecture. |

## Status

**Pre-build** — vision + architecture decided (see `docs/`); app scaffolding to follow.

## Engine (in one line)

Each hobit is a **`ClaudeAgent`**: primary path is the **Claude Code `claude -p` headless CLI on
a Max subscription ($0)**; the **Claude Agent SDK + API key** is the paid drop-in alternative.
