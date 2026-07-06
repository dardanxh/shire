# Domain Model — Phase 1 (The Substrate)

> Rigorous DDD specification for Phase 1. **Models are documented here first, then implemented.**
> Scope: register a git repository, clone it, run deterministic scanners (L1 facts + basic L2
> structure), persist as an immutable analysis snapshot, expose via API. LLM-dependent layers
> (L3 narrative, semantic index population) are scaffolded, not populated, in Phase 1.

## Ubiquitous language

- **Repository** — a tracked codebase (a git repo the user asked Hobits to watch).
- **Provider** — where the repo is hosted: GitHub, GitLab, Bitbucket, or a generic git URL.
- **Ingestion** — register → clone → analyze → ready. The lifecycle of onboarding a repository.
- **Analysis** — an immutable, point-in-time snapshot of the substrate for a repository at a
  specific commit SHA. Re-analyzing a repo produces a *new* Analysis (enables L4 history later).
- **Facts (L1)** — deterministic, objective metrics: age, commit/contributor counts, LOC by
  language, dependencies, CI/CD, license, tests.
- **Structure (L2)** — architecture-shaped facts: language breakdown, file tree summary,
  hotspots (churn × size).
- **Hotspot** — a file that changes often *and* is large/complex — a risk zone.

## Bounded contexts

Two contexts, each with its own aggregate. They are linked by `repository_id` only (no shared
tables), keeping them decoupled.

```
┌─────────────────────────┐        ┌──────────────────────────────────────┐
│  Repository context     │        │  Substrate context                    │
│  aggregate: Repository  │ 1  ──▶ *│  aggregate: Analysis (per commit SHA) │
└─────────────────────────┘        └──────────────────────────────────────┘
```

---

## Repository context

### Aggregate root: `Repository`

The system of record for a tracked codebase and its ingestion lifecycle.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Identity. |
| `coordinates` | `RepoCoordinates` (VO) | Natural key: provider + owner + name. |
| `url` | `RepoUrl` (VO) | Canonical clone URL. |
| `default_branch` | str | e.g. `main`. |
| `clone_path` | str \| null | Local filesystem path once cloned. |
| `status` | `IngestionStatus` (VO/enum) | See lifecycle below. |
| `last_analyzed_commit` | str \| null | SHA of the newest Analysis. |
| `last_analyzed_at` | datetime \| null | |
| `error` | str \| null | Populated on `failed`. |
| `created_at` / `updated_at` | datetime | |

**Invariants**
- `coordinates` is unique (no duplicate tracking of the same repo).
- A valid `url` is required to leave `registered`.
- `clone_path` must be set before status can reach `analyzing`.

**Lifecycle (`IngestionStatus`)**
`registered → cloning → analyzing → ready` — with `failed` reachable from any active state
(carrying `error`). Re-ingestion moves `ready → cloning` again.

### Value objects

- **`GitProvider`** — enum: `github | gitlab | bitbucket | generic`.
- **`RepoCoordinates`** — `(provider, owner, name)`; renders a canonical slug `owner/name`.
- **`RepoUrl`** — validated git URL (https or ssh); can derive coordinates for known providers.
- **`IngestionStatus`** — enum: `registered | cloning | analyzing | ready | failed`.

---

## Substrate context

### Aggregate root: `Analysis`

An immutable snapshot of the substrate for one repository at one commit SHA. All child collections
belong to the Analysis (they are created and replaced atomically with it).

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Identity. |
| `repository_id` | UUID | Link to Repository aggregate (id only). |
| `commit_sha` | str | The analyzed commit. `(repository_id, commit_sha)` is unique. |
| `status` | enum | `running | complete | failed`. |
| `analyzed_at` | datetime | |
| **L1 scalar facts** | | (embedded value object `RepositoryFacts`) |
| `first_commit_at` / `last_commit_at` | datetime | Repo age boundaries. |
| `commit_count` | int | |
| `contributor_count` | int | |
| `loc_total` | int | |
| `primary_language` | str \| null | Highest-LOC language. |
| `license_spdx` | str \| null | Detected SPDX id. |
| `has_tests` | bool | |
| `dependency_count` | int | |

**Child collections** (each an entity/VO owned by the Analysis):

- **`Contributor`** — `(name, email, commits, first_commit_at, last_commit_at)`.
- **`CommitActivity`** — daily counts: list of `(day: date, count: int)` (drives the commits chart).
- **`LanguageStat`** — per language: `(language, loc, files, pct)`.
- **`Dependency`** (VO) — `(ecosystem, name, version, manifest_file, is_dev)`. `ecosystem` ∈
  `pip | npm | ...`. Enables cross-repo "who uses X" queries.
- **`CiCdConfig`** (VO) — `(system, config_files[])`. `system` ∈ `github_actions | gitlab_ci |
  circleci | jenkins | travis | azure_pipelines | ...`.
- **`Hotspot`** — `(path, churn, size, score)`; `score = churn × size` (risk proxy).

**Invariants**
- An Analysis is immutable once `complete`; a new analysis is created for a new commit.
- Scalar facts are derived from the child collections and the git history — always internally
  consistent within one snapshot.
- The latest `complete` Analysis for a repository is the "current substrate".

### Scaffolded (Phase 1 schema only, populated later)

- **Semantic code index** — pgvector extension enabled; a `code_chunk` table
  `(analysis_id, path, content, embedding vector)` is created in migrations but **not populated**
  in Phase 1 (embedding generation lands with the local-embeddings + ClaudeAgent work).
- **L3 narrative / L4 delta-watch** — modeled conceptually (see `architecture.md`); no tables
  beyond the immutable-Analysis design that already enables history.

---

## Cross-repo (a taste in Phase 1)

Because `Dependency` rows carry `(ecosystem, name, version)` across all analyses, a simple query
answers *"which of my repos depend on package X?"* — the first thread of the cross-repo system
graph, available for free from the L1 data.

---

## Module organization (DDD layering)

Each bounded context is a package with the standard four layers; a shared kernel holds
cross-cutting primitives. Dependencies point inward (api → application → domain; infrastructure
implements domain ports).

```
be/src/hobits/
  shared/                 # shared kernel
    domain/               # base Entity/AggregateRoot, ValueObject, common types
    infrastructure/       # db engine/session, settings, uow
  repository/             # Repository bounded context
    domain/               # Repository, VOs, RepositoryRepository (port)
    application/          # RegisterRepository, IngestRepository use cases
    infrastructure/       # SQLAlchemy models+repo, git providers, clone service
    api/                  # FastAPI router
  substrate/              # Substrate bounded context
    domain/               # Analysis + children, AnalysisRepository (port), Scanner port
    application/          # AnalyzeRepository use case (orchestrates scanners)
    infrastructure/       # SQLAlchemy models+repo, concrete scanners
    api/                  # FastAPI router
  main.py                 # FastAPI app assembly + DI wiring
```

**Reusability principles**
- Scanners implement a common `Scanner` port (`scan(clone_path, git_history) -> partial facts`),
  so new scanners plug in without touching the pipeline.
- Persistence is behind repository ports; domain never imports SQLAlchemy.
- Value objects are immutable and shared via the shared kernel where cross-context.
