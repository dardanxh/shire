# Hobits Engine Service

The execution half of the Hobits job system. The backend enqueues jobs (rows in the shared
Postgres `jobs` table); this service claims them with `FOR UPDATE SKIP LOCKED`, runs them through
an LLM engine, writes the result back, and notifies the backend.

The service is **domain-agnostic**: a job is just `{prompt, system, cwd, allowed_tools, model,
timeout_seconds}` in, raw text out. All parsing and domain persistence happens in the backend's
completion handlers. Swapping Claude for another engine means implementing the `Engine` protocol
in `src/engine/model.py` — nothing else changes.

## Run

```bash
cd engine
cp .env.example .env   # adjust if your Postgres isn't the default docker-compose one
uv run python -m engine
```

## Scale out

The service is stateless — every instance competes for jobs on the same table, and
`FOR UPDATE SKIP LOCKED` guarantees each job is claimed by exactly one worker. To drain a backlog
faster, just start more processes:

```bash
uv run python -m engine   # instance 1
uv run python -m engine   # instance 2, in another terminal
```

Each instance stamps its `worker_id` (`hostname:pid`) on the jobs it runs, requeues only its own
jobs on restart, and participates in the stale sweep that recovers jobs from dead workers.

## Kind routing and the host runner

`ENGINE_INCLUDE_KINDS` / `ENGINE_EXCLUDE_KINDS` (comma-separated) limit which job kinds an
instance claims. The Docker engine excludes `ai_action.run`; `scripts/host-runner.sh` runs this
service natively with the operator's own `claude` (their claude.ai connectors and skills) and
includes only that kind. `ENGINE_APPLICATION_NAME` tags its DB connections so the backend can
tell whether the runner is connected.

Optional payload keys beyond the basics: `permission_mode` (`default` | `bypassPermissions`, where
the deny-list becomes the boundary), `setting_sources` (`""` | `"user"`, which loads user-level
skills), `scratch_workspace` (run in a fresh temp dir under `cwd`, removed afterwards), and
`result_file` (a plain file name in that scratch dir; its contents become the job result, and
`{{RESULT_FILE}}` in the system prompt is replaced with its absolute path).

## Constraints

- Must run on the **same host** as the backend for now: jobs reference repo clones by absolute
  path (`payload.cwd` under `be/.data/repos/...`), and the Claude CLI engine uses the logged-in
  `claude` Max session. Containerizing later means sharing the clone volume and CLI auth.
- Postgres LISTEN/NOTIFY is a latency optimization only — the worker also polls every
  `ENGINE_POLL_INTERVAL_SECONDS`, so jobs are never lost if notifications are missed.
