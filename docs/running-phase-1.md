# Running Phase 1 (the Substrate)

Phase 1 delivers the **repo-intelligence substrate**: connect a git URL, clone it, run
deterministic scanners (L1 facts + basic L2 structure), persist an immutable analysis snapshot,
and view it. Backend is fully working; UI is a local web app.

## Prerequisites
- Docker (running), `uv`, Node ≥ 20. (`uv` manages Python 3.13 itself.)

## Backend (`be/`)

```bash
cd be

# 1. Start Postgres (pgvector) — host port 5433
docker compose up -d

# 2. Install deps (uv creates a Python 3.13 venv)
uv sync

# 3. Apply migrations (creates the schema + enables the `vector` extension)
uv run alembic upgrade head

# 4. Run the API (http://localhost:8000, docs at /docs)
uv run uvicorn hobits.main:app --reload --port 8000
```

Ingest a repository and read its analysis:

```bash
curl -X POST http://localhost:8000/repositories \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://github.com/pypa/sampleproject.git"}'

# then, using the returned id:
curl http://localhost:8000/repositories/<id>/analysis
```

Tests + lint:

```bash
uv run pytest -q
uv run ruff check .
```

### Endpoints
| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/repositories` | Register + clone + analyze a git URL (blocks until done). |
| `GET` | `/repositories` | List tracked repositories. |
| `GET` | `/repositories/{id}` | Repository + ingestion status. |
| `GET` | `/repositories/{id}/analysis` | Latest analysis (facts, languages, deps, CI/CD, hotspots, contributors, commit activity). |
| `GET` | `/dependencies/{name}/repositories` | Cross-repo: which repos use a dependency (+ versions). |

## Frontend (`ui/`)

```bash
cd ui
npm install
# ensure .env.local has NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev            # http://localhost:3000
```

## What's implemented vs scaffolded

**Working:** git ingestion (GitHub/GitLab/Bitbucket/generic URLs) + local clone; L1 facts (age,
commits, contributors, commits/day, LOC by language, dependencies + versions, CI/CD, license,
tests); basic L2 (language breakdown, hotspots = churn × size); immutable analysis snapshots;
cross-repo dependency query; REST API; local web UI.

**Scaffolded (schema/interfaces only — populated in later phases):** the semantic code index
(`code_chunks` + pgvector column, not embedded yet — needs the local embeddings model), the L3
mental-model narrative (needs the ClaudeAgent engine), and L4 delta-watch/scheduling (Prefect
wraps the ingest pipeline). The ingest pipeline is already behind an orchestration seam.
