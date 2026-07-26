# CLAUDE.md

## Project Overview

Shire backend — repo-intelligence substrate. FastAPI + SQLAlchemy + PostgreSQL.
(The generic conventions below come from a blueprint template; see "Project reality" at the
bottom for how this repo differs.)

## Tech Stack

- **Framework**: FastAPI
- **ORM**: SQLAlchemy (sync)
- **Database**: PostgreSQL (pgvector)
- **Migrations**: Alembic
- **Auth**: none (local-first; see Project reality)
- **Python**: 3.13+

## Project Structure

Backend is a **modular monolith**: code is grouped by domain first, then by
layer inside each domain.

```
be/
├── main.py                  # FastAPI app entry point; wires routers from app/domain/*
├── app/
│   ├── core/                # Cross-cutting infrastructure
│   │   ├── db.py            #   Base, mixins, prefixed_id_column, enum_column
│   │   ├── exceptions.py    #   AppError + subclasses
│   │   ├── enums.py         #   shared StrEnums (UserRole, ProjectPriority, ...)
│   │   ├── permissions.py   #   Permission, ROLE_PERMISSIONS
│   │   └── scope.py         #   per-request authorization scope
│   ├── dependencies/        # FastAPI dependencies (auth, db session, file URLs, s3)
│   ├── integrations/        # External SDK wrappers (Cognito, S3)
│   ├── utils/               # Helpers (jwt verifier, etc.)
│   └── domain/              # 15 feature packages — one per domain
│       ├── __init__.py      # eager-imports every domain so Base.metadata is populated
│       └── <domain>/
│           ├── models.py        # SQLAlchemy entities
│           ├── schemas.py       # Pydantic Create/Update/Result schemas
│           ├── repositories.py  # Data access (entities in/out)
│           ├── services.py      # Business logic (schemas in/out)
│           └── routes.py        # FastAPI routers
├── alembic/                 # Database migrations
└── docs/                    # Conventions and documentation
```

Active domains: `activity_log`, `analytics`, `attachment`, `customer`,
`marketplace`, `organization`, `partner`, `project`, `tag`, `task`, `team`,
`timeline`, `user`, `workflow`.

## Architecture Conventions

### Layering (inside each domain)

- **Routes** -> **Services** -> **Repositories** -> **Database**
- Routes handle HTTP concerns (request/response, status codes, dependencies)
- Services handle business logic, receive Pydantic schemas, return `*Result` schemas
- Repositories handle data access, operate exclusively on SQLAlchemy entities
- **Services must never return SQLAlchemy entities** — always map to result schemas
- **Services call other services, never another domain's repository.** This
  keeps domains extractable into separate services later.

### Bulk Operations

- All CRUD methods (create, get, update, delete) operate in **bulk** (lists in, lists out)
- Parameter names must be descriptive: `projects`, `users`, `organizations` — not `data`

### Schema Naming

- Input: `Create*`, `Update*`
- Output: `*Result` (not `*Response`)

### Enum Values

- Enum values must match database check constraints exactly (lowercase)
- Always verify enum values against the migration files

## Running the App

```bash
cd be
uvicorn main:app --reload
```

## Useful Commands

```bash
# Create a new migration
alembic revision --autogenerate -m "description"

# Run migrations
alembic upgrade head

# Rollback one migration
alembic downgrade -1
```

## Reference

- API best practices: `.claude/skills/fastapi-best-practices/SKILL.md`
- Service conventions: `docs/service/conventions.md`
- Database models: `docs/database/models.md`

## Project reality (how this repo differs from the generic conventions above)

The conventions above are the source of truth for *how we build*. A few concrete facts about
*this* repo (Shire — a repository-intelligence substrate, not a factory/CRM platform) differ from
the generic template; follow these when they conflict:

- **`src/shire/` package, not `app/` + `main.py`.** This is a `uv`-packaged src-layout project
  (`pyproject.toml`, `shire.*` imports, `migrations/` via Alembic). Entry point is
  `shire.main:app`; run with `uv run uvicorn shire.main:app --reload`.
- **Layout is layer-per-domain inside `src/shire/`:**
  - `core/` — `db.py`, `settings.py`, `domain_base.py` (DDD base types), `exceptions.py`
    (`AppError` + subclasses + global handlers → `{detail, code}`), `pagination.py`
    (`PaginationParams` + `Page[T]`), `metadata.py`.
  - `domain/<ctx>/` — one folder per bounded context (`repository`, `substrate`) with
    `models.py` (SQLAlchemy ORM entities), `domain.py` (the DDD aggregate + value objects +
    ports — this repo is hexagonal, so domain models are rich Pydantic objects distinct from the
    ORM rows), `schemas.py` (`Create*` / `*Result`), `repositories.py` (data access),
    `services.py` (business logic, returns `*Result`), `routes.py` (FastAPI router).
  - `integrations/` — external adapters (git clone, GitHub client, `git_history`, `scanners/`,
    `external_tools/`).
- **Two domains, not fifteen:** `repository` (ingest/clone/list/get/refresh) and `substrate`
  (analysis snapshot, tools, on-demand tool runs). No customer/project/task/team/etc.
- **Codebase graph (emerge) is an *artifact* tool, not a scanner.** `external_tools/emerge.py`
  runs [emerge](https://github.com/glato/emerge) against a clone and produces an interactive D3
  HTML app under `<graph_root>/<repo_id>/html/` — it does **not** contribute scalar metrics or
  ratings, so it stays out of the scanner/enrichment pipeline (`tool_scanners()`). It's surfaced in
  `GET /tools` for availability only; run it via `POST /repositories/{id}/graph/run` and read state
  via `GET /repositories/{id}/graph`. The HTML is served read-only by a `StaticFiles` mount at
  `/api/v1/graph-artifacts` (under `/api/v1` so the UI iframes it same-origin through the Vite
  proxy). **Install caveat:** emerge is stale (2024) with dependency drift — on Python 3.13 it needs
  `uv tool install emerge-viz --with 'setuptools<81' --with pip --with 'networkx<3.4'` (the
  `networkx<3.4` pin matters: 3.4 flipped `node_link_data`'s edge key from `links`→`edges`, which
  silently blanks emerge's graph canvas). Since `uv tool` installs to `~/.local/bin` (often off the
  server's PATH) the adapter probes that path directly.
- **Three more visualization tools follow the same artifact pattern** (own endpoint, not the scanner
  flow; surfaced in `GET /tools` for availability only). Their artifacts live under
  `<artifacts_root>/<tool>/<repo_id>/` served at `/api/v1/artifacts`; each has
  `GET/POST /repositories/{id}/<kind>[/run]`:
  - **git-of-theseus** (`code-age`) — code survival/age SVG. `uv tool install git-of-theseus`.
    Resolves binaries from `~/.local/bin`. Serves `stack.svg` (shown as an `<img>`).
  - **code-maat** (`coupling`) — temporal (change) coupling. *Data*, not an artifact: git log →
    `java -jar code-maat …-standalone.jar -c git2 -a coupling` → CSV → JSON cached to disk. Needs
    `java` + the jar in `~/.local/share/code-maat/` (or `$SHIRE_CODE_MAAT_JAR`).
  - **CodeCharta** (`code-map`) — 3D code-city map. `ccsh unifiedparser` → `.cc.json` (we gunzip it
    so static serving doesn't fight `Content-Encoding`). The **viewer is a separate static SPA**
    (`codecharta-visualization`) mounted at `/api/v1/cc-viewer`; the map loads via
    `…/cc-viewer/index.html?file=<map-url>`. `npm i -g codecharta-analysis codecharta-visualization`.
    Viewer dir resolved from `$SHIRE_CODECHARTA_VIEWER` or the npm global root; `viewer_available`
    is reported separately from `tool_available`.
- **No auth.** There is no Cognito, no permissions/scope, no `current_user` dependency — the
  shire backend is unauthenticated. Ignore the auth sections until auth is introduced.
- **Bulk CRUD is N/A for the single-resource ingest** (`POST /api/v1/repositories` takes one
  URL). Pagination *is* applied to the list endpoint (`Page[RepositoryResult]`).
- Everything else — `/api/v1` prefix, `{detail, code}` errors via global handlers,
  `Create*`/`*Result` schema naming, `response_model` + `tags` + status codes, routes → services
  → repositories, services never returning ORM entities — is followed as written above.
- **The `ui/` SPA consumes this API** (openapi-generated types). Changing a path or response shape
  means regenerating UI types (`pnpm openapi:gen` in `ui/`) and updating the affected hook.
- **Two pagination envelopes coexist.** The original Shire domains paginate via
  `shire/core/pagination.py` (`PaginationParams`, `Page[T]` → `{items, total, page, page_size,
  total_pages}`). The knowledge-catalog domains ported from Tuesdayta (`archetype`, `blueprint`,
  `technology`, `modelling`, `security`, `qualities`) use `fastapi-pagination` (`Params`, `Page` →
  `{items, total, page, size, pages}`; `add_pagination(app)` is called in `main.py`). Match the
  style of the domain you're editing; don't mix them within a domain.
- **Knowledge catalogs are seed data.** `src/shire/seeds/` (console script `shire-seed`, run by
  `docker-entrypoint.sh` after migrations) upserts curated JSON catalogs by slug. Rows with
  `source='seed'` are refreshed on every run; rows with `source='user'` are never touched. Edit
  the JSON under `seeds/data/`, not the DB, for catalog content changes.
