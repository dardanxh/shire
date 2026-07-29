# Contributing to Shire

Thanks for your interest in contributing! This document covers the development workflow and
conventions. For what Shire *is*, start with the [README](./README.md) and [`docs/`](./docs).
For what's planned and good first areas, see the [roadmap](./ROADMAP.md).

By participating you agree to our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Monorepo layout

| Path | Service | Stack |
| --- | --- | --- |
| `be/` | Backend API | Python 3.13, FastAPI, SQLAlchemy 2, Alembic, uv |
| `engine/` | Job worker | Python 3.13, psycopg, uv |
| `ui/` | Frontend | React 19, Vite, TanStack, Tailwind 4, pnpm |
| `docs/` | Vision & architecture | Markdown |
| `scripts/` | Native dev scripts | Bash |

## Development setup

Two options:

**Docker (quickest to a running stack):**

```bash
./setup.sh
```

**Native (best for iterating on code):**

```bash
./scripts/setup.sh   # uv sync, pnpm install, Postgres container, migrations, scanner tools
./scripts/run.sh     # backend :8000 (reload off), engine, UI dev server :5173
```

For backend iteration, run uvicorn with reload directly:

```bash
cd be && uv run uvicorn shire.main:app --reload --port 8000
```

## Code conventions

Detailed, binding conventions live next to the code — read them before larger changes:

- **Backend**: [`be/CLAUDE.md`](./be/CLAUDE.md) — layer-per-domain structure
  (routes → services → repositories), `Create*`/`*Result` schema naming, error model.
- **Frontend**: [`ui/CLAUDE.md`](./ui/CLAUDE.md) — feature folders, query-key factories,
  forms (RHF + Zod), i18n (no hardcoded user-facing strings), state hierarchy.

## Checks to run before a PR

Backend / engine:

```bash
cd be && uv run ruff check && uv run pytest
cd engine && uv run ruff check && uv run pytest
```

Frontend:

```bash
cd ui && pnpm typecheck && pnpm lint && pnpm test
```

## Common workflows

**Database schema change** (backend):

```bash
cd be
uv run alembic revision --autogenerate -m "describe the change"
uv run alembic upgrade head
```

**Changed an API path or schema?** Regenerate the UI's types (backend must be running):

```bash
cd ui && pnpm openapi:gen
```

Commit the regenerated `src/lib/api-types.gen.ts` with your change.

**Adding an external analysis tool**: add an adapter in
`be/src/shire/integrations/external_tools/`, register it in that package's `__init__.py`, and
document it in `docs/external-tools.md`. Tools must degrade gracefully when the binary is
missing (report unavailable, never crash).

## Pull requests

1. Fork and create a feature branch off `main`.
2. Keep PRs focused — one logical change per PR.
3. Make sure the checks above pass and the app boots (`./setup.sh` or `./scripts/run.sh`).
4. Describe *why* alongside *what* in the PR description.

## Reporting issues

Use the issue templates. For security issues, **do not open a public issue** — see
[SECURITY.md](./SECURITY.md).
