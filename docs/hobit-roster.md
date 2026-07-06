# Hobit Roster

> **The roster is USER-EXTENSIBLE by design.** Dardan can define arbitrarily many experts via
> prompting (name, charter, exemplars, tools, cadence). The lists below are **seeds, not a fixed
> set.** All hobits read the shared substrate (see [`repo-intelligence.md`](./repo-intelligence.md)).

## Foundational / new-feature hobits (committed)

- **News / informer** — subscribes to links/mediums, daily relevance check (new versions, private
  previews, CVEs) → Briefing. *First-class template; proves the whole scheduled-watcher model.*
- **Repo onboarding** *(new feature)* — on clone, produces the mental-model doc (architecture,
  hotspots, key files, scary parts).
- **Meeting / standup prep** *(new feature)* — assembles talking points from recent activity +
  open threads + calendar before a meeting.
- **Devil's-advocate council** *(new feature)* — a red-team mode: hobits explicitly told to
  *refute* a decision, for blind-spot insurance.

## Domain experts (from the brief)

python-efficiency · pipeline-idempotency · pipeline-backfill · scalability · code-quality ·
pragmatic-next-steps · visionary · security · aws-big-data · gcp-warehousing · workshop-recommender
· **cost**

## Engineering-health experts (committed)

- **data-quality / schema-contract** — schema diffs, contracts, null/type drift, breaking changes.
- **dependency-upgrade planner** — safe upgrade paths, blast radius across the system graph.
- **tech-debt / refactoring** — debt hotspots (churn × complexity), paydown, trend over time.
- **test-health / coverage** — untested risk zones, flaky tests, coverage drops after merges.

## Data-platform specialists (committed)

- **data-product**
- **data-mesh**
- **data-governance**
- **data-privacy / security** (PII, GDPR, payments systems)
- **DataOps**
- **metadata-management**

## Data-engineering deep specialists (committed)

- **data-modeling** (dimensional / Data Vault)
- **streaming / real-time** (Kafka / Flink)
- **observability / reliability** (SRE-for-data)
- **dbt / transformation-layer**
- **data-extraction / connectors**
- **lakehouse** (Iceberg, Apache Hudi)
- **GCP big-data infrastructure**
- **AWS big-data infrastructure**

## Parked (not committed)

- Quick-capture inbox · PR/code-review companion · decision journal (ADR assistant) ·
  career/growth hobit · "explain the diff" watcher · weekly retro.
