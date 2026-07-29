# Roadmap

Where Shire is headed. This is a living document — items move between sections as
priorities shift, and [issues](../../issues) are the place to discuss or claim any of them.
Nothing here is a promise; everything here is an invitation.

## Now — hardening for the community

The near-term focus is making the codebase as contributor-friendly as it is
feature-rich:

- **Test coverage** — the backend has an integration-test baseline; the UI and engine
  ship with a small smoke-test scaffold. Growing real coverage (component tests for the
  UI's forms and tables, worker state-transition tests for the engine) is the top
  engineering priority and a great first-contribution area.
- **Static typing for Python** — adopt mypy (strict where feasible) across `be/` and
  `engine/`, wired into CI.
- **Coverage reporting** — pytest-cov + a coverage gate in CI so quality is visible.
- **Pre-commit hooks** — ruff + Biome locally, so CI stops being the first line of defense.

## Next — product depth

- **Scheduled hobits (Prefect)** — cadence-based and event-triggered hobit runs with
  retries and run history, Postgres-backed (no Redis). The groundwork exists behind the
  Phase 2.5 settings; finishing and defaulting it is the next product milestone.
- **PR / code-review companion** — a hobit that reviews pull requests in context of the
  substrate (ownership, coupling, drift), not just the diff.
- **"Explain the diff" watcher** — on-demand narrative for any change range, building on
  the evolution snapshots.
- **Decision journal** — an ADR assistant that captures and audits architectural
  decisions against the codebase over time.

## Later — bigger bets

- **Cross-repo ripple / system view** — enrich the substrate so changes in one repo
  surface their blast radius across the fleet.
- **Weekly retro & quick-capture inbox** — lightweight personal-workflow surfaces on top
  of the briefing.
- **Trust ladder** — hobits earn autonomy (from report-only to open-a-PR) based on rated
  run history.
- **Multi-user & auth** — Shire is deliberately local-first and single-user today; a
  proper auth story is the gate to team deployments.
- **Dark mode & theming** — the theme plumbing (next-themes, token-based styling) is in
  place; the dark palette isn't.

## How to contribute

Fork away — that's the point of the license. Small, focused PRs beat big ones; see
[CONTRIBUTING.md](./CONTRIBUTING.md) for the dev setup and conventions, and the binding
per-service convention docs in [`be/CLAUDE.md`](./be/CLAUDE.md) and
[`ui/CLAUDE.md`](./ui/CLAUDE.md). Good first areas:

- Tests anywhere (see "Now" above) — high value, low coordination cost.
- A new [external analysis tool adapter](./CONTRIBUTING.md#common-workflows) — the
  adapter pattern makes these self-contained.
- A new hobit for the built-in roster — see [`docs/hobit-roster.md`](./docs/hobit-roster.md).
- Knowledge-catalog entries — curated content, no code required.

If you want to take on something larger from this roadmap, open an issue first so we can
agree on shape before you invest serious time.
