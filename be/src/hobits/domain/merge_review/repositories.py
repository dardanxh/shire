"""Data access for merge reviews. Operates on ORM rows — the review's payloads are JSONB
documents, so no separate aggregate mapping layer is needed (the service maps rows → results)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from hobits.domain.merge_review.models import MergeReviewRow, MrHobitReviewRow


class SqlMergeReviewRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, row: MergeReviewRow) -> None:
        self._session.add(row)
        self._session.flush()

    def get(self, review_id: uuid.UUID) -> MergeReviewRow | None:
        return self._session.get(MergeReviewRow, review_id)

    def list(
        self, *, repository_id: uuid.UUID | None, limit: int, offset: int
    ) -> list[MergeReviewRow]:
        stmt = select(MergeReviewRow).order_by(MergeReviewRow.created_at.desc())
        if repository_id is not None:
            stmt = stmt.where(MergeReviewRow.repository_id == repository_id)
        return list(self._session.scalars(stmt.limit(limit).offset(offset)))

    def count(self, *, repository_id: uuid.UUID | None) -> int:
        stmt = select(func.count()).select_from(MergeReviewRow)
        if repository_id is not None:
            stmt = stmt.where(MergeReviewRow.repository_id == repository_id)
        return self._session.scalar(stmt) or 0

    def delete(self, review_id: uuid.UUID) -> None:
        row = self.get(review_id)
        if row is not None:
            self._session.delete(row)
            self._session.flush()

    def try_reset(self, review_id: uuid.UUID) -> bool:
        """Atomically move a non-running review back to pending (the re-analyze guard).
        False when an analysis is currently running — the caller must not touch the row."""
        result = self._session.execute(
            update(MergeReviewRow)
            .where(MergeReviewRow.id == review_id, MergeReviewRow.overall_status != "running")
            .values(overall_status="pending", updated_at=datetime.now(UTC))
        )
        return result.rowcount == 1

    def try_claim(self, review_id: uuid.UUID) -> bool:
        """Atomically claim a pending review for the background pipeline (pending → running).
        False means another pipeline already owns it — the caller exits silently."""
        result = self._session.execute(
            update(MergeReviewRow)
            .where(MergeReviewRow.id == review_id, MergeReviewRow.overall_status == "pending")
            .values(overall_status="running", updated_at=datetime.now(UTC))
        )
        return result.rowcount == 1


class SqlMrHobitReviewRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_for_review(self, review_id: uuid.UUID) -> list[MrHobitReviewRow]:
        stmt = (
            select(MrHobitReviewRow)
            .where(MrHobitReviewRow.merge_review_id == review_id)
            .order_by(MrHobitReviewRow.hobit_slug)
        )
        return list(self._session.scalars(stmt))

    def get(self, review_id: uuid.UUID, slug: str) -> MrHobitReviewRow | None:
        stmt = select(MrHobitReviewRow).where(
            MrHobitReviewRow.merge_review_id == review_id,
            MrHobitReviewRow.hobit_slug == slug,
        )
        return self._session.scalars(stmt).first()

    def replace_for_review(self, review_id: uuid.UUID, slugs: list[str]) -> None:
        """Reset to fresh pending stubs — one per selected hobit (create + re-analyze)."""
        for row in self.list_for_review(review_id):
            self._session.delete(row)
        self._session.flush()
        for slug in slugs:
            self._session.add(
                MrHobitReviewRow(merge_review_id=review_id, hobit_slug=slug, status="pending")
            )
        self._session.flush()
