"""Completion handlers for substrate engine jobs (architecture / overview / dependency gains).

Each handler writes the same disk artifact its old synchronous counterpart wrote, so the status
endpoints and UI panels are unchanged. When a succeeded job's output is unusable (no Mermaid
block, unparseable overview), the handler flips the job to `failed` with a reason — the Jobs UI
is the error surface for artifacts that have no domain row of their own.
"""

from __future__ import annotations

import json
import logging
import uuid
from pathlib import Path

from hobits.core.db import unit_of_work
from hobits.core.settings import get_settings
from hobits.domain.jobs.models import JobRow
from hobits.domain.substrate.schemas import DependencyFreshnessItem
from hobits.domain.substrate.services import (
    _extract_mermaid_block,
    _parse_overview,
    parse_gains,
)

logger = logging.getLogger(__name__)


def handle_architecture(job: JobRow) -> None:
    if job.status != "succeeded":
        return  # the job row already carries the error
    mermaid = _extract_mermaid_block(job.result or "")
    if not mermaid:
        _mark_failed(job.id, "The agent did not return a valid Mermaid diagram.")
        return
    out_dir = _artifact_dir("architecture", job.payload["repository_id"])
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{job.payload['kind']}.json").write_text(json.dumps({"mermaid": mermaid}))


def handle_codebase_overview(job: JobRow) -> None:
    if job.status != "succeeded":
        return
    overview = _parse_overview(job.result or "")
    if overview is None:
        _mark_failed(job.id, "The agent did not return a usable overview.")
        return
    out_dir = _artifact_dir("codebase-overview", job.payload["repository_id"])
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "overview.json").write_text(json.dumps(overview))


def handle_dependency_gains(job: JobRow) -> None:
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
