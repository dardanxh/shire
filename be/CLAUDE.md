# CLAUDE.md

## Project Overview

Factory management platform backend — FastAPI + SQLAlchemy + PostgreSQL.

## Tech Stack

- **Framework**: FastAPI
- **ORM**: SQLAlchemy (sync)
- **Database**: PostgreSQL
- **Migrations**: Alembic
- **Auth**: AWS Cognito
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
*this* repo (hobits — a repository-scorecard substrate, not a factory/CRM platform) differ from
the generic template; follow these when they conflict:

- **`src/hobits/` package, not `app/` + `main.py`.** This is a `uv`-packaged src-layout project
  (`pyproject.toml`, `hobits.*` imports, `migrations/` via Alembic). Entry point is
  `hobits.main:app`; run with `uv run uvicorn hobits.main:app --reload`.
- **Layout is layer-per-domain inside `src/hobits/`:**
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
- **No auth.** There is no Cognito, no permissions/scope, no `current_user` dependency — the
  hobits backend is unauthenticated. Ignore the auth sections until auth is introduced.
- **Bulk CRUD is N/A for the single-resource ingest** (`POST /api/v1/repositories` takes one
  URL). Pagination *is* applied to the list endpoint (`Page[RepositoryResult]`).
- Everything else — `/api/v1` prefix, `{detail, code}` errors via global handlers,
  `Create*`/`*Result` schema naming, `response_model` + `tags` + status codes, routes → services
  → repositories, services never returning ORM entities — is followed as written above.
- **The `ui/` SPA consumes this API** (openapi-generated types). Changing a path or response shape
  means regenerating UI types (`pnpm openapi:gen` in `ui/`) and updating the affected hook.
