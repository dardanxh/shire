"""Data access for hobit config overrides and run history."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from shire.domain.hobits.domain import (
    CustomHobit,
    FeedbackEntry,
    HobitConfigOverride,
    HobitFeedbackRecord,
    HobitGuidanceRecord,
    HobitRunRecord,
    HobitSpec,
)
from shire.domain.hobits.models import (
    CustomHobitRow,
    HobitConfigRow,
    HobitGuidanceRow,
    HobitRunFeedbackRow,
    HobitRunRow,
    RemovedHobitRow,
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
            name=row.name,
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
        name: str,
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
        row.name = name
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
            default_charter=row.charter,
            default_instructions=row.instructions,
            default_model=row.model,
            default_timeout_seconds=row.timeout_seconds,
            writes_narrative=False,
            default_tags=_parse_tags(row.tags) or [],
        ),
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
        row.charter = spec.default_charter
        row.instructions = spec.default_instructions
        row.model = spec.default_model
        row.timeout_seconds = spec.default_timeout_seconds
        row.tags = ",".join(t.strip() for t in spec.default_tags if t.strip())
        row.updated_at = now

    def delete(self, slug: str) -> None:
        row = self._session.get(CustomHobitRow, slug)
        if row is not None:
            self._session.delete(row)


class SqlRemovedHobitRepository:
    """Data access for deleted built-in hobits (the `removed_hobits` tombstone table)."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def slugs(self) -> set[str]:
        return set(self._session.scalars(select(RemovedHobitRow.slug)))

    def add(self, slug: str) -> None:
        if self._session.get(RemovedHobitRow, slug) is None:
            self._session.add(RemovedHobitRow(slug=slug, removed_at=datetime.now(UTC)))


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

    def assignment_counts(self) -> dict[str, tuple[int, int]]:
        """hobit_slug -> (assigned repos, scheduled repos [cadence other than manual])."""
        stmt = select(
            RepositoryHobitRow.hobit_slug,
            func.count(),
            func.count().filter(RepositoryHobitRow.cadence != "manual"),
        ).group_by(RepositoryHobitRow.hobit_slug)
        return {
            slug: (total, scheduled)
            for slug, total, scheduled in self._session.execute(stmt)
        }

    def assignments_for_hobit(
        self, slug: str
    ) -> list[tuple[uuid.UUID, str, str, datetime | None]]:
        """(repository_id, repository slug, cadence, last_checked_at) per assigned repo.
        Joins the repositories table directly (data layer only — same precedent as home/roadmap)."""
        from shire.domain.repository.models import RepositoryRow

        stmt = (
            select(
                RepositoryHobitRow.repository_id,
                RepositoryRow.owner,
                RepositoryRow.name,
                RepositoryHobitRow.cadence,
                RepositoryHobitRow.last_checked_at,
            )
            .join(RepositoryRow, RepositoryRow.id == RepositoryHobitRow.repository_id)
            .where(RepositoryHobitRow.hobit_slug == slug)
            .order_by(RepositoryRow.owner, RepositoryRow.name)
        )
        return [
            (repo_id, f"{owner}/{name}", cadence, last_checked)
            for repo_id, owner, name, cadence, last_checked in self._session.execute(stmt)
        ]


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


class SqlHobitFeedbackRepository:
    """Data access for run feedback (the `hobit_run_feedback` table, one row per run)."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, run_id: uuid.UUID) -> HobitFeedbackRecord | None:
        row = self._session.get(HobitRunFeedbackRow, run_id)
        return _to_feedback(row) if row else None

    def upsert(
        self,
        *,
        run_id: uuid.UUID,
        hobit_slug: str,
        repository_slug: str,
        rating: int,
        comment: str | None,
    ) -> HobitFeedbackRecord:
        now = datetime.now(UTC)
        row = self._session.get(HobitRunFeedbackRow, run_id)
        if row is None:
            row = HobitRunFeedbackRow(run_id=run_id, created_at=now)
            self._session.add(row)
        row.hobit_slug = hobit_slug
        row.repository_slug = repository_slug
        row.rating = rating
        row.comment = comment
        row.updated_at = now
        return _to_feedback(row)

    def delete(self, run_id: uuid.UUID) -> bool:
        row = self._session.get(HobitRunFeedbackRow, run_id)
        if row is None:
            return False
        self._session.delete(row)
        return True

    def recent_entries(self, slug: str, limit: int) -> list[FeedbackEntry]:
        """The newest feedback for one hobit across every repository, shaped for prompts."""
        stmt = (
            select(HobitRunFeedbackRow, HobitRunRow.headline)
            .join(HobitRunRow, HobitRunFeedbackRow.run_id == HobitRunRow.id)
            .where(HobitRunFeedbackRow.hobit_slug == slug)
            .order_by(HobitRunFeedbackRow.updated_at.desc())
            .limit(limit)
        )
        return [
            FeedbackEntry(
                rating=row.rating,
                comment=row.comment,
                repository_slug=row.repository_slug,
                headline=headline,
                created_at=row.created_at,
            )
            for row, headline in self._session.execute(stmt)
        ]

    def count_changed_since(self, slug: str, since: datetime | None) -> int:
        stmt = (
            select(func.count())
            .select_from(HobitRunFeedbackRow)
            .where(HobitRunFeedbackRow.hobit_slug == slug)
        )
        if since is not None:
            stmt = stmt.where(HobitRunFeedbackRow.updated_at > since)
        return self._session.scalar(stmt) or 0


class SqlHobitGuidanceRepository:
    """Data access for distilled standing guidance (the `hobit_guidance` table)."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, slug: str) -> HobitGuidanceRecord | None:
        row = self._session.get(HobitGuidanceRow, slug)
        return _to_guidance(row) if row else None

    def mark_enqueued(self, slug: str) -> None:
        row = self._get_or_create(slug)
        row.distill_enqueued_at = datetime.now(UTC)
        row.updated_at = datetime.now(UTC)

    def clear_enqueued(self, slug: str) -> None:
        row = self._session.get(HobitGuidanceRow, slug)
        if row is not None:
            row.distill_enqueued_at = None
            row.updated_at = datetime.now(UTC)

    def apply_distilled(self, slug: str, guidance: str, feedback_count: int) -> None:
        now = datetime.now(UTC)
        row = self._get_or_create(slug)
        row.guidance = guidance
        row.last_distilled_at = now
        row.feedback_count = feedback_count
        row.distill_enqueued_at = None
        row.updated_at = now

    def delete(self, slug: str) -> None:
        self._session.execute(
            delete(HobitGuidanceRow).where(HobitGuidanceRow.hobit_slug == slug)
        )

    def _get_or_create(self, slug: str) -> HobitGuidanceRow:
        row = self._session.get(HobitGuidanceRow, slug)
        if row is None:
            row = HobitGuidanceRow(
                hobit_slug=slug, feedback_count=0, created_at=datetime.now(UTC)
            )
            self._session.add(row)
        return row


def _to_feedback(row: HobitRunFeedbackRow) -> HobitFeedbackRecord:
    return HobitFeedbackRecord(
        run_id=row.run_id,
        hobit_slug=row.hobit_slug,
        repository_slug=row.repository_slug,
        rating=row.rating,
        comment=row.comment,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _to_guidance(row: HobitGuidanceRow) -> HobitGuidanceRecord:
    return HobitGuidanceRecord(
        hobit_slug=row.hobit_slug,
        guidance=row.guidance,
        last_distilled_at=row.last_distilled_at,
        feedback_count=row.feedback_count,
        distill_enqueued_at=row.distill_enqueued_at,
    )


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
