"""Data access for hobit config overrides and run history."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from hobits.domain.hobits.domain import HobitConfigOverride, HobitRunRecord
from hobits.domain.hobits.models import HobitConfigRow, HobitRunRow


class SqlHobitConfigRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, slug: str) -> HobitConfigOverride | None:
        row = self._session.get(HobitConfigRow, slug)
        if row is None:
            return None
        return HobitConfigOverride(
            slug=row.slug,
            enabled=row.enabled,
            model=row.model,
            charter=row.charter,
            instructions=row.instructions,
            timeout_seconds=row.timeout_seconds,
        )

    def upsert(
        self,
        slug: str,
        *,
        enabled: bool,
        model: str,
        charter: str,
        instructions: str,
        timeout_seconds: float,
    ) -> None:
        now = datetime.now(UTC)
        row = self._session.get(HobitConfigRow, slug)
        if row is None:
            row = HobitConfigRow(slug=slug, created_at=now)
            self._session.add(row)
        row.enabled = enabled
        row.model = model
        row.charter = charter
        row.instructions = instructions
        row.timeout_seconds = timeout_seconds
        row.updated_at = now


class SqlHobitRunRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, run: HobitRunRecord) -> None:
        self._session.add(_to_row(run))
        # Flush now so a dependent briefing_items insert (FK → hobit_runs.id) in the same
        # transaction sees the row, regardless of autoflush timing.
        self._session.flush()

    def list_for_repository(self, repository_id: uuid.UUID) -> list[HobitRunRecord]:
        stmt = (
            select(HobitRunRow)
            .where(HobitRunRow.repository_id == repository_id)
            .order_by(HobitRunRow.started_at.desc())
        )
        return [_to_record(r) for r in self._session.scalars(stmt)]

    def list_for_hobit(self, slug: str) -> list[HobitRunRecord]:
        """All runs of one hobit across every repository, newest first."""
        stmt = (
            select(HobitRunRow)
            .where(HobitRunRow.hobit_slug == slug)
            .order_by(HobitRunRow.started_at.desc())
        )
        return [_to_record(r) for r in self._session.scalars(stmt)]

    def latest_for_hobit(self, slug: str) -> HobitRunRecord | None:
        stmt = (
            select(HobitRunRow)
            .where(HobitRunRow.hobit_slug == slug)
            .order_by(HobitRunRow.started_at.desc())
            .limit(1)
        )
        row = self._session.scalars(stmt).first()
        return _to_record(row) if row else None

    def get(self, run_id: uuid.UUID) -> HobitRunRecord | None:
        row = self._session.get(HobitRunRow, run_id)
        return _to_record(row) if row else None


def _to_row(r: HobitRunRecord) -> HobitRunRow:
    return HobitRunRow(
        id=r.id,
        repository_id=r.repository_id,
        hobit_slug=r.hobit_slug,
        status=r.status,
        commit_sha=r.commit_sha,
        headline=r.headline,
        narrative=r.narrative,
        importance=r.importance,
        confidence=r.confidence,
        urgency=r.urgency,
        tier=r.tier,
        raw_output=r.raw_output,
        error=r.error,
        duration_seconds=r.duration_seconds,
        started_at=r.started_at,
        finished_at=r.finished_at,
    )


def _to_record(row: HobitRunRow) -> HobitRunRecord:
    return HobitRunRecord(
        id=row.id,
        repository_id=row.repository_id,
        hobit_slug=row.hobit_slug,
        status=row.status,
        commit_sha=row.commit_sha,
        headline=row.headline,
        narrative=row.narrative,
        importance=row.importance,
        confidence=row.confidence,
        urgency=row.urgency,
        tier=row.tier,
        raw_output=row.raw_output,
        error=row.error,
        duration_seconds=row.duration_seconds,
        started_at=row.started_at,
        finished_at=row.finished_at,
    )
