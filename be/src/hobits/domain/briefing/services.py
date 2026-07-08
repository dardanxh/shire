"""Briefing service: emit items from hobit runs; serve the tiered digest."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from hobits.domain.briefing.domain import BriefingTier, derive_tier
from hobits.domain.briefing.models import BriefingItemRow
from hobits.domain.briefing.repositories import SqlBriefingRepository
from hobits.domain.briefing.schemas import BriefingItemResult, TieredBriefingResult

if TYPE_CHECKING:
    from hobits.domain.hobits.domain import HobitRunRecord


class BriefingService:
    """Business logic for the Briefing. Constructed per request from a DB session."""

    def __init__(self, session: Session) -> None:
        self._items = SqlBriefingRepository(session)

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

    def get_briefing(self) -> TieredBriefingResult:
        items = [_to_result(row) for row in self._items.list_all()]
        return TieredBriefingResult(
            now=[i for i in items if i.tier == BriefingTier.now.value],
            daily=[i for i in items if i.tier == BriefingTier.daily.value],
            weekly=[i for i in items if i.tier == BriefingTier.weekly.value],
        )


def _to_result(row: BriefingItemRow) -> BriefingItemResult:
    return BriefingItemResult(
        id=row.id,
        repository_id=row.repository_id,
        hobit_run_id=row.hobit_run_id,
        hobit_slug=row.hobit_slug,
        tier=row.tier,
        headline=row.headline,
        importance=row.importance,
        confidence=row.confidence,
        urgency=row.urgency,
        created_at=row.created_at,
    )
