"""Briefing service: emit items from hobit runs; serve the tiered digest."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from hobits.domain.briefing.domain import derive_tier
from hobits.domain.briefing.models import BriefingItemRow
from hobits.domain.briefing.repositories import SqlBriefingRepository
from hobits.domain.briefing.schemas import BriefingItemResult
from hobits.domain.repository.repositories import SqlRepositoryRepository

if TYPE_CHECKING:
    from hobits.domain.hobits.domain import HobitRunRecord


class BriefingService:
    """Business logic for the Briefing. Constructed per request from a DB session."""

    def __init__(self, session: Session) -> None:
        self._items = SqlBriefingRepository(session)
        # Cross-domain read to label each post with its repository (owner/name).
        self._repos = SqlRepositoryRepository(session)

    def create_from_run(self, run: HobitRunRecord) -> None:
        """Emit a briefing item for a scored hobit run. No-op for runs without a score/headline
        (e.g. agent_unavailable / timeout / error) — nothing to surface."""
        if (
            run.importance is None
            or run.confidence is None
            or run.urgency is None
            or not run.headline
        ):
            return
        tier = run.tier or derive_tier(run.importance, run.confidence, run.urgency).value
        self._items.add(
            BriefingItemRow(
                repository_id=run.repository_id,
                hobit_run_id=run.id,
                hobit_slug=run.hobit_slug,
                tier=tier,
                headline=run.headline,
                importance=run.importance,
                confidence=run.confidence,
                urgency=run.urgency,
                created_at=datetime.now(UTC),
            )
        )

    def get_briefing(self, hobit_slug: str | None = None) -> list[BriefingItemResult]:
        """The feed, newest first, each post labeled with its repository. Filterable by hobit."""
        rows = self._items.list_all(hobit_slug)
        slugs: dict[uuid.UUID, str] = {}
        for rid in {row.repository_id for row in rows}:
            repo = self._repos.get(rid)
            slugs[rid] = repo.coordinates.slug if repo else "—"
        return [_to_result(row, slugs.get(row.repository_id, "—")) for row in rows]

    def unread_counts(self) -> dict[str, int]:
        """{hobit_slug: unread post count}."""
        return self._items.unread_counts()

    def unread_count(self, hobit_slug: str) -> int:
        return self._items.unread_counts().get(hobit_slug, 0)

    def mark_read(self, item_id: uuid.UUID) -> None:
        """Mark one post read."""
        self._items.mark_read(item_id)

    def mark_read_for_hobit(self, hobit_slug: str | None = None) -> None:
        """Mark all unread posts read — one hobit's, or all when no slug given."""
        self._items.mark_read_for_hobit(hobit_slug)


def _to_result(row: BriefingItemRow, repository_slug: str) -> BriefingItemResult:
    return BriefingItemResult(
        id=row.id,
        repository_id=row.repository_id,
        repository_slug=repository_slug,
        hobit_run_id=row.hobit_run_id,
        hobit_slug=row.hobit_slug,
        tier=row.tier,
        headline=row.headline,
        importance=row.importance,
        confidence=row.confidence,
        urgency=row.urgency,
        created_at=row.created_at,
        read_at=row.read_at,
    )
