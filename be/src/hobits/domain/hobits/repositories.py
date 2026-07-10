"""Data access for hobit config overrides and run history."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from hobits.domain.hobits.domain import (
    CustomHobit,
    HobitConfigOverride,
    HobitRunRecord,
    HobitSpec,
)
from hobits.domain.hobits.models import (
    CustomHobitRow,
    HobitConfigRow,
    HobitRunRow,
    RepositoryHobitRow,
)


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
            tags=_parse_tags(row.tags),
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
        tags: list[str],
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
        row.tags = ",".join(t.strip() for t in tags if t.strip())
        row.updated_at = now

    def delete(self, slug: str) -> None:
        self._session.execute(delete(HobitConfigRow).where(HobitConfigRow.slug == slug))


def _parse_tags(value: str | None) -> list[str] | None:
    """None (never saved) -> None (use spec default); a saved string -> the tag list (maybe [])."""
    if value is None:
        return None
    return [t.strip() for t in value.split(",") if t.strip()]


def _to_custom(row: CustomHobitRow) -> CustomHobit:
    return CustomHobit(
        spec=HobitSpec(
            slug=row.slug,
            name=row.name,
            description=row.description,
            category=row.category,
            default_charter=row.charter,
            default_instructions=row.instructions,
            default_model=row.model,
            default_timeout_seconds=row.timeout_seconds,
            writes_narrative=False,
            default_tags=_parse_tags(row.tags) or [],
        ),
        enabled=row.enabled,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


class SqlCustomHobitRepository:
    """Data access for user-authored hobits (the `custom_hobits` table)."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def list(self) -> list[CustomHobit]:
        rows = self._session.scalars(
            select(CustomHobitRow).order_by(CustomHobitRow.created_at)
        )
        return [_to_custom(r) for r in rows]

    def get(self, slug: str) -> CustomHobit | None:
        row = self._session.get(CustomHobitRow, slug)
        return _to_custom(row) if row else None

    def slugs(self) -> set[str]:
        return set(self._session.scalars(select(CustomHobitRow.slug)))

    def upsert(self, custom: CustomHobit) -> None:
        now = datetime.now(UTC)
        spec = custom.spec
        row = self._session.get(CustomHobitRow, spec.slug)
        if row is None:
            row = CustomHobitRow(slug=spec.slug, created_at=custom.created_at or now)
            self._session.add(row)
        row.name = spec.name
        row.description = spec.description
        row.category = spec.category
        row.charter = spec.default_charter
        row.instructions = spec.default_instructions
        row.model = spec.default_model
        row.timeout_seconds = spec.default_timeout_seconds
        row.tags = ",".join(t.strip() for t in spec.default_tags if t.strip())
        row.enabled = custom.enabled
        row.updated_at = now

    def delete(self, slug: str) -> None:
        row = self._session.get(CustomHobitRow, slug)
        if row is not None:
            self._session.delete(row)


class SqlRepositoryHobitRepository:
    """Per-repo hobit access allow-list (mirrors SqlRepositoryToolRepository)."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def linked_slugs(self, repository_id: uuid.UUID) -> set[str]:
        stmt = select(RepositoryHobitRow.hobit_slug).where(
            RepositoryHobitRow.repository_id == repository_id
        )
        return set(self._session.scalars(stmt))

    def has_any(self, repository_id: uuid.UUID) -> bool:
        stmt = (
            select(func.count())
            .select_from(RepositoryHobitRow)
            .where(RepositoryHobitRow.repository_id == repository_id)
        )
        return (self._session.scalar(stmt) or 0) > 0

    def assignment_map(
        self, repository_id: uuid.UUID
    ) -> dict[str, tuple[str, datetime | None]]:
        """slug -> (cadence, last_checked_at) for every hobit assigned to this repo."""
        stmt = select(
            RepositoryHobitRow.hobit_slug,
            RepositoryHobitRow.cadence,
            RepositoryHobitRow.last_checked_at,
        ).where(RepositoryHobitRow.repository_id == repository_id)
        return {
            slug: (cadence, last_checked)
            for slug, cadence, last_checked in self._session.execute(stmt)
        }

    def set_all(self, repository_id: uuid.UUID, slugs: set[str]) -> None:
        # Preserve cadence/last_checked for hobits that stay assigned across the replace, so
        # re-saving the allow-list doesn't silently reset a hobit's schedule.
        kept = {
            row.hobit_slug: row
            for row in self._session.scalars(
                select(RepositoryHobitRow).where(
                    RepositoryHobitRow.repository_id == repository_id
                )
            )
            if row.hobit_slug in slugs
        }
        self._session.execute(
            delete(RepositoryHobitRow).where(
                RepositoryHobitRow.repository_id == repository_id
            )
        )
        self._session.flush()
        now = datetime.now(UTC)
        self._session.add_all(
            RepositoryHobitRow(
                repository_id=repository_id,
                hobit_slug=slug,
                linked_at=now,
                cadence=kept[slug].cadence if slug in kept else "manual",
                last_checked_at=kept[slug].last_checked_at if slug in kept else None,
            )
            for slug in slugs
        )

    def set_cadence(self, repository_id: uuid.UUID, slug: str, cadence: str) -> bool:
        """Set an assignment's run cadence. Returns False if the hobit isn't assigned."""
        row = self._session.get(RepositoryHobitRow, (repository_id, slug))
        if row is None:
            return False
        row.cadence = cadence
        return True

    def remove_hobit(self, slug: str) -> None:
        """Unassign a hobit from every repository (used when the hobit is deleted)."""
        self._session.execute(
            delete(RepositoryHobitRow).where(RepositoryHobitRow.hobit_slug == slug)
        )

    def mark_checked(self, repository_id: uuid.UUID, slug: str) -> None:
        """Record that the scheduler just evaluated this assignment. No-op if unassigned
        (e.g. a Foundational hobit that isn't in the repo's allow-list)."""
        row = self._session.get(RepositoryHobitRow, (repository_id, slug))
        if row is not None:
            row.last_checked_at = datetime.now(UTC)


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

    def latest_result_for(self, repository_id: uuid.UUID, slug: str) -> HobitRunRecord | None:
        """Newest run of one hobit on one repo that actually produced a result (completed or
        parse_failed) — the baseline the change gate compares the current commit against. Error
        and skip rows are ignored so a failed/skipped run doesn't wedge the gate."""
        stmt = (
            select(HobitRunRow)
            .where(
                HobitRunRow.repository_id == repository_id,
                HobitRunRow.hobit_slug == slug,
                HobitRunRow.status.in_(("completed", "parse_failed")),
            )
            .order_by(HobitRunRow.started_at.desc())
            .limit(1)
        )
        row = self._session.scalars(stmt).first()
        return _to_record(row) if row else None

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

    def delete_for_hobit(self, slug: str) -> None:
        """Delete every run of a hobit (its briefing items cascade via the FK)."""
        self._session.execute(delete(HobitRunRow).where(HobitRunRow.hobit_slug == slug))


def _to_row(r: HobitRunRecord) -> HobitRunRow:
    return HobitRunRow(
        id=r.id,
        repository_id=r.repository_id,
        hobit_slug=r.hobit_slug,
        status=r.status,
        trigger=r.trigger,
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
        trigger=row.trigger,
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
