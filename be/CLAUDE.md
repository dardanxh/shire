# CLAUDE.md

## Project Overview

Shire — the Hobits backend. A repo-intelligence substrate (clone/scan/analyze repositories) plus
the engine that runs **hobits**: narrow-domain Claude agents that explore a repository and produce
scored findings. FastAPI + SQLAlchemy (sync) + PostgreSQL/pgvector.

## Tech Stack

- **Framework**: FastAPI, sync route handlers (run in threadpool)
- **ORM**: SQLAlchemy 2.0 (sync), psycopg3
- **Database**: PostgreSQL with pgvector (`docker-compose.yml`, host port 5433)
- **Migrations**: Alembic (`migrations/`)
- **Package/env**: `uv`, src-layout (`src/shire/`), Python 3.13+
- **Scheduling**: Prefect (`orchestration/`), off by default (`SHIRE_SCHEDULER_ENABLED`)
- **Agent engine**: the `claude -p` headless CLI (see "The hobit engine" below)
- **Auth**: none — local-first, no Cognito/permissions/`current_user`
- **Pagination**: two coexisting envelopes — see "Pagination" below

## Project Structure

```
be/
├── src/shire/
│   ├── main.py               # FastAPI app assembly: routers, CORS, exception handlers,
│   │                          #   static mounts for tool artifacts, lifespan (dispatcher + Prefect sync)
│   ├── core/                 # Cross-cutting infrastructure
│   │   ├── db.py             #   Base, engine, unit_of_work(), get_session()
│   │   ├── settings.py       #   Settings (env prefix SHIRE_, pydantic-settings)
│   │   ├── domain_base.py    #   ValueObject / Entity / AggregateRoot (shared-kernel DDD types)
│   │   ├── exceptions.py     #   AppError + NotFoundError/ConflictError/ValidationError + handlers
│   │   ├── pagination.py     #   PaginationParams + Page[T] (the original Shire pagination shape)
│   │   └── metadata.py       #   imports shire.domain so Base.metadata is fully populated
│   ├── domain/                # one package per bounded context — see "Domains" below
│   │   ├── __init__.py        # eager-imports every domain's models.py (for Alembic autogenerate)
│   │   └── <name>/
│   │       ├── domain.py         # DDD aggregate + value objects + ports (no SQLAlchemy/httpx imports)
│   │       ├── models.py         # SQLAlchemy ORM entities
│   │       ├── schemas.py        # Pydantic Create*/Update*/*Result schemas
│   │       ├── repositories.py   # data access — entities in/out, class `Sql<Name>Repository`
│   │       ├── services.py       # business logic — schemas in/out, class `<Name>Service`
│   │       └── routes.py         # FastAPI router
│   ├── agent/
│   │   └── mcp_server.py      # MCP server exposing repo context/search/read to a Claude agent
│   ├── integrations/          # External adapters
│   │   ├── claude_agent.py       #   ClaudeAgent — the `claude -p` CLI wrapper (the hobit engine)
│   │   ├── git_clone.py, git_history.py, git_branches.py, git_diff.py, git_worktree.py
│   │   ├── git_providers/        #   GitHub/GitLab/Bitbucket/local provider clients
│   │   ├── scanners/              #   deterministic code/git scanners feeding substrate analysis
│   │   └── external_tools/        #   wrappers for emerge, git-of-theseus, code-maat, CodeCharta,
│   │                               #   ruff, bandit, vulture, osv, syft, scorecard, scc, gitleaks
│   ├── orchestration/         # Prefect flows + schedule sync (Phase 2.5, opt-in)
│   └── seeds/                 # Knowledge-catalog seed data + `shire-seed` CLI (see "Seeds" below)
├── migrations/                # Alembic (env.py, script.py.mako, versions/)
├── tests/                     # pytest, pythonpath=src
└── .claude/skills/fastapi-best-practices/SKILL.md
```

## Domains

`src/shire/domain/` currently holds 26 packages. Run `ls src/shire/domain` for the live list;
as of this writing it is: `activity`, `blueprint`, `briefing`, `capacity`, `compliance`,
`connections`, `context`, `council`, `hobits`, `home`, `jobs`, `members`, `merge_review`,
`modelling`, `news`, `principles`, `qualities`, `readiness`, `repository`, `roadmap`, `security`,
`substrate`, `techchoice`, `technology`, `tools`, `watchlist`.

Two groups:
- **Original Shire domains** — repository ingestion/analysis and the product logic built on it
  (`repository`, `substrate`, `hobits`, `council`, `merge_review`, `briefing`, `context`,
  `connections`, `jobs`, `activity`, `news`, `roadmap`, `readiness`, `capacity`, `compliance`,
  `techchoice`, `principles`, `members`, `tools`, `home`, `watchlist`).
- **Knowledge catalogs ported from Tuesdayta** — `archetype`(`blueprint`), `technology`,
  `modelling`, `security`, `qualities`. Seeded reference data (architectures, tech, threat
  models, quality attributes) that hobits and other domains draw on.

Not every domain has every file: `home` and `watchlist` are read-model/aggregation domains — they
have `schemas.py`/`services.py`/`routes.py` but no `models.py`/`domain.py`/`repositories.py` of
their own; they compose other domains' services instead. Check `src/shire/domain/__init__.py` — it
eager-imports every domain that owns ORM models.

## Architecture Conventions

### Layering (inside each domain)

- **Routes** → **Services** → **Repositories** → **Database**
- Routes handle HTTP concerns only (status codes, `Depends`, `response_model`)
- Services hold business logic: take Pydantic schemas in, return `*Result` schemas out —
  **never** SQLAlchemy entities
- Repositories operate exclusively on SQLAlchemy entities (`Sql<Name>Repository`)
- **Services call other services, not another domain's repository** — keeps domains extractable
- Domains that follow strict hexagonal shape (e.g. `repository`) also have `domain.py`: a rich
  Pydantic aggregate + value objects + ports, distinct from the `models.py` ORM rows; the domain
  layer never imports SQLAlchemy, GitPython, or httpx

### CRUD is single-item, not bulk

Despite older docs claiming bulk (`lists in, lists out`) CRUD, every real domain takes and returns
one item at a time: `create(data: CreateX) -> XResult`, `get(id) -> XResult`,
`update(id, data: UpdateX) -> XResult`, `delete(id) -> None`. Follow this shape for new
endpoints; list endpoints return a `Page[XResult]` (see "Pagination"), not a bulk-create response.

### Schema Naming

- Input: `Create*`, `Update*`
- Output: `*Result` (never `*Response`)

### Errors

- Raise `AppError` subclasses (`NotFoundError`, `ConflictError`, `ValidationError`) from
  `shire.core.exceptions` in services — routes stay free of HTTP status plumbing
- Every handled error serializes to `{"detail": ..., "code": ...}`; unexpected exceptions
  collapse to a generic 500 and are never leaked to the client

### Pagination

Two envelopes coexist — match the one already used in the domain you're editing:

- **Original Shire domains** use `shire.core.pagination`: `PaginationParams` (`?page=&page_size=`)
  as a route dependency, `Page[T].create(items, total, params)` returning
  `{items, total, page, page_size, total_pages}`.
- **Knowledge-catalog domains** (`blueprint`, `technology`, `modelling`, `security`, `qualities`)
  use `fastapi_pagination`: `Params` as the dependency, `Page[T]` returning
  `{items, total, page, size, pages}`. `add_pagination(app)` is called once in `main.py`.

Don't mix the two envelopes within one domain.

### Enum Values

- Enum values must match database check constraints exactly (lowercase)
- Verify against the migration files when in doubt

## The hobit engine

A **hobit** is a narrow-domain Claude agent: a code template (charter + run logic) with
user-editable config (model, charter, limits), defined in `src/shire/domain/hobits/`:

- `domain.py` — `Hobit`, `HobitSpec`, run/self-score value objects
- `registry.py` — `all_specs()` / `get_hobit(slug)`, backed by the seed roster
- `roster.py` — the seed `HobitSpec` list: architecture/quality experts generated from the
  knowledge-catalog seeds, hand-written technology experts, MR reviewers, and the foundational
  `repo-onboarding` hobit
- `repo_hobit.py` — the generic `RepoHobit` engine: explore a clone via `claude -p`, produce a
  document, self-score it for the briefing feed
- `jobs.py` — completion handlers (`handle_hobit_run`, `handle_feedback_distill`) that settle a
  run and emit overlays (context-pack narrative, briefing item) once the engine call finishes
- `models.py` / `schemas.py` / `repositories.py` / `services.py` / `routes.py` — the standard set

The actual CLI wrapper lives in `src/shire/integrations/claude_agent.py`: `ClaudeAgent.run()`
shells out to `claude -p ... --output-format json` in a repo clone with a read-only tool allowlist
(`Read`, `Grep`, `Glob`; no Write/Edit/Bash), and never raises — failures come back as
`AgentRun(ok=False, error=...)`. This is the primary, $0 engine (runs on the logged-in Max
subscription; `ANTHROPIC_API_KEY` is stripped from the run env unless `SHIRE_USE_API_KEY=true`).
The Claude Agent SDK is a documented paid alternative behind the same `run()` shape, not yet wired
in.

`src/shire/agent/mcp_server.py` is a separate piece: an MCP server (stdio, `FastMCP`) that exposes
the context pack, keyword code search, and file reads to a Claude agent working against a Shire
repo — `uv run python -m shire.agent.mcp_server`, registered via `claude mcp add shire -- ...`.

Hobit runs, and other Claude-CLI calls across the codebase (MR classification, substrate
architecture/overview/tech-stack narratives, council takes, roadmap generation, ...), go through
the generic async job queue in `src/shire/domain/jobs/` (`kinds.py` enumerates every job kind).
`main.py`'s lifespan starts a completion dispatcher thread (`jobs/dispatcher.py`) that LISTENs on
Postgres for settled jobs and applies each one exactly once via its handler.

## Visualization tools

`external_tools/` wraps standalone repo-analysis tools surfaced via `GET /tools` for availability,
each with its own `GET/POST /repositories/{id}/<kind>[/run]` endpoint — not part of the
scanner/enrichment pipeline (`integrations/scanners/enrichment.py`):

- **emerge** (`external_tools/emerge.py`) — interactive D3 codebase graph, served read-only under
  `/api/v1/graph-artifacts`. Stale upstream (2024); on Python 3.13 install with
  `uv tool install emerge-viz --with 'setuptools<81' --with pip --with 'networkx<3.4'` (the
  `networkx<3.4` pin matters — 3.4 renamed `node_link_data`'s edge key `links`→`edges`, which
  silently blanks the graph canvas).
- **git-of-theseus** (`code-age`) — code survival/age SVG (`uv tool install git-of-theseus`).
- **code-maat** (`coupling`) — temporal coupling, computed (not a static artifact): git log →
  `code-maat-standalone.jar` → CSV → JSON, cached to disk. Needs `java` + the jar under
  `~/.local/share/code-maat/` or `$SHIRE_CODE_MAAT_JAR`.
- **CodeCharta** (`code-map`) — 3D code-city map (`ccsh unifiedparser`). The viewer is a separate
  static SPA (`codecharta-visualization`) mounted at `/api/v1/cc-viewer`; resolved from
  `$SHIRE_CODECHARTA_VIEWER` or the npm global root — `viewer_available` is reported separately
  from `tool_available`.

All four resolve their binaries from `~/.local/bin` directly (that's where `uv tool`/npm globals
land, and it's often off a server's PATH).

## Seeds

`src/shire/seeds/` (console script `shire-seed`, run by `docker-entrypoint.sh` after migrations)
upserts the knowledge-catalog JSON under `seeds/data/` by slug. Rows with `source='seed'` are
refreshed on every run; rows with `source='user'` are left alone. Edit the JSON, not the database,
to change catalog content — the hobit roster's architecture/quality experts are generated from
this same data, so adding a catalog entry adds its expert automatically.

## Running the App

```bash
cd be
uv run uvicorn shire.main:app --reload
```

Postgres: `docker compose up -d` (starts `shire-db` on host port 5433).

## Useful Commands

```bash
uv run pytest                                        # tests/ (pythonpath=src)
uv run ruff check .                                   # lint
uv run ruff format .                                  # format
alembic revision --autogenerate -m "description"      # new migration
alembic upgrade head                                  # apply migrations
alembic downgrade -1                                   # rollback one migration
```

## Reference

- API design conventions: `.claude/skills/fastapi-best-practices/SKILL.md`
- Scaffold a new domain: `/new-domain <name>` (`.claude/commands/new-domain.md`)

## Notes for future changes

- **The `ui/` SPA consumes this API** via openapi-generated types. Changing a route path or
  response shape means regenerating UI types (`pnpm openapi:gen` in `ui/`) and updating the
  affected hook.
