# Running Phase 2.5 — Scheduled, self-refreshing hobits

Phase 2.5 turns hobits from manual, on-demand runs into **scheduled workers that refresh only when
needed**. Each repo↔hobit assignment gets a **cadence** (manual / hourly / daily / weekly / a custom
cron), and a **change gate** ensures a scheduled tick spends a `claude -p` call *only if the repo
actually moved* since that hobit's last result.

## The two moving parts

1. **The change gate** (always on, no infra). Before a scheduled run, the backend does a cheap
   `git ls-remote` to read the remote's current HEAD and compares it to the commit the hobit last
   produced a result on. Unchanged → it records a `skipped_unchanged` run and spends nothing.
   Changed → it refreshes the substrate to the new commit and runs the hobit. This is the
   "deterministic-first, LLM-on-deltas" principle from NFR #1. You can invoke it by hand at
   `POST /api/v1/repositories/{id}/hobits/{slug}/refresh`.

2. **Prefect** (the scheduler). One Prefect **deployment per assignment** carries that assignment's
   schedule; a **worker** executes them on a **process work pool**. The backend upserts/removes
   deployments as you change cadence — you never touch Prefect directly.

```
uvicorn (API :8000)         ← scripts/run.sh, with HOBITS_SCHEDULER_ENABLED=true
prefect server (:4200)      ┐
prefect worker (process)    ┘ ← scripts/scheduler.sh
     └─ deployment per (repo, hobit) with a schedule
     └─ fires → run_hobit_flow → change gate → run or skip
```

> Prefect pulls in `redis` as a transitive dependency, but the orchestration backend is Postgres —
> we do not run or require a Redis broker.

## One-time / each-run setup

Enable the integration on the API (off by default so the app runs standalone):

```bash
# be/.env
HOBITS_SCHEDULER_ENABLED=true
HOBITS_PREFECT_API_URL=http://127.0.0.1:4200/api   # optional; matches PREFECT_API_URL
HOBITS_PREFECT_WORK_POOL=hobits-pool               # optional
```

Then, in two terminals:

```bash
./scripts/run.sh          # DB + API (:8000) + UI (:3000)
./scripts/scheduler.sh    # Prefect server (:4200) + process worker
```

`scheduler.sh` starts the server, creates the `hobits-pool` process pool if missing, and starts a
worker. The API's startup hook reconciles existing cadences into deployments; thereafter every
cadence change is synced immediately.

## Setting a cadence

- **UI:** the cadence picker on each assigned hobit (repo → Hobits).
- **API:** `PUT /api/v1/repositories/{id}/hobits/{slug}/cadence` with
  `{"cadence": "daily"}` — accepts `manual`, `hourly`, `daily`, `weekly`, or `cron:<expr>`
  (e.g. `cron:0 9 * * 1-5` for weekday mornings). `manual` removes the deployment.

## Observability

- **Prefect UI** (http://localhost:4200) — schedules, run history, retries, logs per deployment.
- **Hobits feed / run history** — scheduled runs are tagged `trigger=scheduled`; ticks that found
  nothing new appear as `skipped_unchanged` (they don't post to the briefing).

## Notes & gotchas

- The worker imports the flow as the installed module `hobits.orchestration.flows:run_hobit_flow`,
  so it must run inside the `be/` project env (`uv run`, as `scheduler.sh` does).
- If Prefect is down, the API still works: assignment/cadence edits log a warning and no-op on the
  Prefect side; nothing is lost — the next startup reconcile (or cadence edit) re-converges.
- Manual "Run" stays fully synchronous and unchanged; only scheduled cadence goes through Prefect.
