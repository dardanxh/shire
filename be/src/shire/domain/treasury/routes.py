"""FastAPI routes for the treasury domain (cost observability). HTTP concerns only."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.domain.treasury.schemas import TreasuryBreakdownResult, TreasuryOverviewResult
from shire.domain.treasury.services import TreasuryService

router = APIRouter(prefix="/treasury", tags=["treasury"])


@router.get("/overview", response_model=TreasuryOverviewResult)
def treasury_overview(
    refresh: bool = False, session: Session = Depends(get_session)
) -> TreasuryOverviewResult:
    """Subscription + this month's machine-wide spend (estimated) vs Shire's share (actual).

    Always 200: when the deployment can't see Claude's local data, the machine-wide fields
    come back null and `claude_data` says why — the Shire-side figures never depend on it.
    `refresh=true` bypasses the transcript-scan cache (the first scan of a session can take
    a few seconds; subsequent ones are incremental).
    """
    return TreasuryService(session).overview(refresh=refresh)


@router.get("/breakdown", response_model=TreasuryBreakdownResult)
def treasury_breakdown(
    window: Literal["7d", "30d", "month", "all"] = "30d",
    session: Session = Depends(get_session),
) -> TreasuryBreakdownResult:
    """Which AI actions consume the tokens: per-kind and per-model sums over the window,
    worst offender first (the Treasury page's bar chart)."""
    return TreasuryService(session).breakdown(window)
