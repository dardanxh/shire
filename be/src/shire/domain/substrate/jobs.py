"""Completion handlers for substrate engine jobs (architecture / overview / dependency gains).

Each handler writes the same disk artifact its old synchronous counterpart wrote, so the status
endpoints and UI panels are unchanged. When a succeeded job's output is unusable (no Mermaid
block, unparseable overview), the handler flips the job to `failed` with a reason — the Jobs UI
is the error surface for artifacts that have no domain row of their own.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from pathlib import Path

from shire.core.db import unit_of_work
from shire.core.settings import get_settings
from shire.domain.jobs.models import JobRow
from shire.domain.repository.models import RepositoryRow
from shire.domain.substrate.repositories import (
    SqlAnalysisDeltaNoteRepository,
    SqlArtifactVersionRepository,
)
from shire.domain.substrate.schemas import DependencyFreshnessItem
from shire.domain.substrate.services import (
    _extract_mermaid_block,
    _parse_overview,
    parse_gains,
    parse_tech_stack,
)

logger = logging.getLogger(__name__)


def _branch_still_active(job: JobRow) -> bool:
    """Staleness guard: a job enqueued for one branch must not write artifacts after the repo
    switched to another (the switch wiped the artifact dirs). Pre-branch-awareness jobs
    (no branch in payload) pass through."""
    expected = job.payload.get("branch")
    if expected is None:
        return True
    with unit_of_work() as session:
        row = session.get(RepositoryRow, uuid.UUID(job.payload["repository_id"]))
        if row is None:
            return False
        return (row.current_branch or row.default_branch) == expected


def _record_version(job: JobRow, artifact: str, kind: str, content: dict) -> None:
    """Append the artifact's new content to the version history (hash-deduped)."""
    with unit_of_work() as session:
        SqlArtifactVersionRepository(session).record(
            repository_id=uuid.UUID(job.payload["repository_id"]),
            artifact=artifact,
            kind=kind,
            branch=job.payload.get("branch") or "",
            commit_sha=job.payload.get("commit_sha") or "",
            content=content,
        )


def handle_architecture(job: JobRow) -> None:
    if not _branch_still_active(job):
        _mark_failed(job.id, "The repository's active branch changed since this job was queued.")
        return
    if job.status != "succeeded":
        return  # the job row already carries the error
    mermaid = _extract_mermaid_block(job.result or "")
    if not mermaid:
        _mark_failed(job.id, "The agent did not return a valid Mermaid diagram.")
        return
    out_dir = _artifact_dir("architecture", job.payload["repository_id"])
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{job.payload['kind']}.json").write_text(json.dumps({"mermaid": mermaid}))
    _record_version(job, "architecture", job.payload["kind"], {"mermaid": mermaid})


def handle_codebase_overview(job: JobRow) -> None:
    if not _branch_still_active(job):
        _mark_failed(job.id, "The repository's active branch changed since this job was queued.")
        return
    if job.status != "succeeded":
        return
    overview = _parse_overview(job.result or "")
    if overview is None:
        _mark_failed(job.id, "The agent did not return a usable overview.")
        return
    out_dir = _artifact_dir("codebase-overview", job.payload["repository_id"])
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "overview.json").write_text(json.dumps(overview))
    _record_version(job, "codebase-overview", "", overview)


def _normalize_tech_name(name: str) -> str:
    """Lowercase and strip non-alphanumerics so "Apache Kafka" == "apache-kafka". Exact
    normalized matching only — no fuzzy matching, so catalog links are never guessed."""
    return "".join(ch for ch in name.lower() if ch.isalnum())


def _tech_slug_lookup() -> dict[str, str]:
    """Normalized name/alias/slug → catalog slug, over the whole technology corpus."""
    from sqlalchemy import select

    from shire.domain.technology.models import TechnologyRow

    lookup: dict[str, str] = {}
    with unit_of_work() as session:
        rows = session.execute(
            select(TechnologyRow.slug, TechnologyRow.name, TechnologyRow.aliases)
        ).all()
        for slug, name, aliases in rows:
            for candidate in (slug, name, *(aliases or [])):
                key = _normalize_tech_name(str(candidate))
                if key:
                    # First writer wins; the corpus has no meaningful collisions.
                    lookup.setdefault(key, slug)
    return lookup


def handle_tech_stack(job: JobRow) -> None:
    if not _branch_still_active(job):
        _mark_failed(job.id, "The repository's active branch changed since this job was queued.")
        return
    if job.status != "succeeded":
        return
    items = parse_tech_stack(job.result or "")
    if items is None:
        _mark_failed(job.id, "The agent did not return a usable technology list.")
        return
    lookup = _tech_slug_lookup()
    for item in items:
        name = item["detected_name"]
        # The agent sometimes annotates names with a parenthetical in either direction
        # ("Apache Kafka (AWS MSK)" / "Amazon MSK (Apache Kafka)") — try the full name,
        # the name with the parenthetical stripped, then the parenthetical content itself.
        candidates = [name, re.sub(r"\s*\(.*?\)", "", name)]
        candidates.extend(re.findall(r"\(([^)]+)\)", name))
        item["slug"] = next(
            (
                slug
                for candidate in candidates
                if (slug := lookup.get(_normalize_tech_name(candidate)))
            ),
            None,
        )
    out_dir = _artifact_dir("tech-stack", job.payload["repository_id"])
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "tech-stack.json").write_text(
        json.dumps({"branch": job.payload.get("branch"), "items": items})
    )
    _record_version(
        job, "tech-stack", "", {"branch": job.payload.get("branch"), "items": items}
    )


def handle_evolution_note(job: JobRow) -> None:
    """Persist the "what changed since last check" narrative for a snapshot pair."""
    if job.status != "succeeded":
        return
    narrative = (job.result or "").strip()
    if not narrative:
        _mark_failed(job.id, "The agent returned an empty change summary.")
        return
    with unit_of_work() as session:
        SqlAnalysisDeltaNoteRepository(session).upsert(
            repository_id=uuid.UUID(job.payload["repository_id"]),
            from_analysis_id=uuid.UUID(job.payload["from_analysis_id"]),
            to_analysis_id=uuid.UUID(job.payload["to_analysis_id"]),
            narrative=narrative,
        )


def handle_dependency_gains(job: JobRow) -> None:
    if not _branch_still_active(job):
        _mark_failed(job.id, "The repository's active branch changed since this job was queued.")
        return
    if job.status != "succeeded":
        return
    gains = parse_gains(job.result or "")
    if not gains:
        _mark_failed(job.id, "The agent did not return parseable upgrade gains.")
        return
    cache = _artifact_dir("dependency-freshness", job.payload["repository_id"]) / "freshness.json"
    if not cache.is_file():
        return  # freshness was cleared/regenerated meanwhile — nothing to enrich
    try:
        items = [DependencyFreshnessItem(**i) for i in json.loads(cache.read_text())]
    except (OSError, json.JSONDecodeError, ValueError, TypeError):
        logger.warning("Could not read freshness cache to apply gains for job %s", job.id)
        return
    for item in items:
        if item.name in gains:
            item.gain = gains[item.name]
    cache.write_text(json.dumps([i.model_dump() for i in items]))


def _artifact_dir(tool: str, repository_id: str) -> Path:
    return get_settings().artifacts_root / tool / str(repository_id)


def _mark_failed(job_id: uuid.UUID, reason: str) -> None:
    """A succeeded engine run whose output is unusable is, for observability purposes, a failed
    job — stamp it so the Jobs UI tells the truth."""
    with unit_of_work() as session:
        row = session.get(JobRow, job_id)
        if row is not None:
            row.status = "failed"
            row.error = reason
