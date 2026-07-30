"""Pydantic read model for the activity feed."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class ActivityEventResult(BaseModel):
    """One entry of the Home activity feed — a recent piece of work, newest first."""

    # The click target: the job id for job-backed events, otherwise the entity id
    # (repository, council topic, merge review) the event describes.
    id: uuid.UUID
    kind: str
    title: str
    # Live job status for job-backed events (joined at read time); None otherwise.
    status: str | None
    repository_id: uuid.UUID | None
    repository_slug: str | None
    occurred_at: datetime
