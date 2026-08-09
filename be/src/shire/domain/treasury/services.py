"""Treasury service: cost observability over the jobs table + Claude's local data.

A pure reporting domain (the `home` precedent): it imports `JobRow` strictly for read-only
aggregation — every Claude invocation Shire makes goes through the jobs queue, so the jobs
table *is* Shire's ledger. The machine-wide side comes from the `claude_data` adapter and
degrades to None when this deployment can't see ~/.claude (see the adapter's docstring).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from shire.domain.jobs.models import JobRow
from shire.domain.treasury.schemas import (
    ClaudeDataStatusResult,
    KindBreakdownResult,
    LifetimeTotalsResult,
    ModelBreakdownResult,
    MonthTotalsResult,
    SubscriptionResult,
    TreasuryBreakdownResult,
    TreasuryOverviewResult,
)
from shire.integrations import claude_data

# The breakdown's time windows. "month" is the calendar month (matches the overview);
# the day-based windows are rolling.
WINDOWS = ("7d", "30d", "month", "all")


def _usage_int(key: str):
    return func.coalesce(func.sum(func.coalesce(JobRow.usage[key].as_integer(), 0)), 0)


def _usage_cost():
    return func.coalesce(
        func.sum(func.coalesce(JobRow.usage["total_cost_usd"].as_float(), 0.0)), 0.0
    )


def _month_start(now: datetime) -> datetime:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


class TreasuryService:
    """Read-model over jobs + Claude local data. Constructed per request from a DB session."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def overview(self, *, refresh: bool = False) -> TreasuryOverviewResult:
        now = datetime.now(UTC)
        month = now.strftime("%Y-%m")
        location = claude_data.resolve_location()

        subscription_result = None
        machine_month = None
        lifetime_result = None
        if location.data_dir is not None:
            machine_month = claude_data.monthly_usage(
                location.data_dir, month, refresh=refresh
            )
            lifetime = claude_data.lifetime_usage(location.data_dir)
            if lifetime is not None:
                lifetime_result = LifetimeTotalsResult(
                    machine_total_tokens=lifetime.total_tokens,
                    machine_cost_usd_estimated=lifetime.cost_usd_estimated,
                    as_of=lifetime.as_of,
                )
        subscription = claude_data.read_subscription(location.config_file)
        if subscription is not None:
            subscription_result = SubscriptionResult(
                organization_type=subscription.organization_type,
                rate_limit_tier=subscription.rate_limit_tier,
                billing_type=subscription.billing_type,
                email=subscription.email,
            )

        shire_jobs, shire_tokens, shire_cost = self._shire_totals(_month_start(now))
        share_pct = None
        if machine_month is not None and machine_month.total_tokens > 0:
            share_pct = round(min(100.0, shire_tokens / machine_month.total_tokens * 100), 1)

        return TreasuryOverviewResult(
            claude_data=ClaudeDataStatusResult(
                available=location.data_dir is not None,
                reason=location.reason,
                data_dir=str(location.data_dir) if location.data_dir else None,
            ),
            subscription=subscription_result,
            month=MonthTotalsResult(
                month=month,
                machine_total_tokens=(
                    machine_month.total_tokens if machine_month is not None else None
                ),
                machine_cost_usd_estimated=(
                    machine_month.cost_usd_estimated if machine_month is not None else None
                ),
                unknown_models=machine_month.unknown_models if machine_month else [],
                shire_jobs=shire_jobs,
                shire_total_tokens=shire_tokens,
                shire_cost_usd=round(shire_cost, 2),
                share_pct=share_pct,
            ),
            lifetime=lifetime_result,
        )

    def breakdown(self, window: str) -> TreasuryBreakdownResult:
        since = self._window_start(window)
        return TreasuryBreakdownResult(
            window=window,
            kinds=self._kind_rows(since),
            models=self._model_rows(since),
        )

    # --- internals ------------------------------------------------------------

    def _shire_totals(self, since: datetime) -> tuple[int, int, float]:
        token_expr = (
            _usage_int("input_tokens")
            + _usage_int("output_tokens")
            + _usage_int("cache_creation_input_tokens")
            + _usage_int("cache_read_input_tokens")
        )
        row = self._session.execute(
            select(func.count(JobRow.id), token_expr, _usage_cost()).where(
                JobRow.created_at >= since
            )
        ).one()
        return int(row[0] or 0), int(row[1] or 0), float(row[2] or 0.0)

    def _window_start(self, window: str) -> datetime | None:
        now = datetime.now(UTC)
        if window == "7d":
            return now - timedelta(days=7)
        if window == "30d":
            return now - timedelta(days=30)
        if window == "month":
            return _month_start(now)
        return None  # "all"

    def _kind_rows(self, since: datetime | None) -> list[KindBreakdownResult]:
        input_expr = _usage_int("input_tokens")
        output_expr = _usage_int("output_tokens")
        cache_read_expr = _usage_int("cache_read_input_tokens")
        cache_creation_expr = _usage_int("cache_creation_input_tokens")
        total_expr = input_expr + output_expr + cache_read_expr + cache_creation_expr

        stmt = select(
            JobRow.kind,
            func.count(JobRow.id),
            input_expr,
            output_expr,
            cache_read_expr,
            cache_creation_expr,
            total_expr,
            _usage_cost(),
        ).group_by(JobRow.kind)
        if since is not None:
            stmt = stmt.where(JobRow.created_at >= since)
        rows = self._session.execute(stmt).all()
        results = [
            KindBreakdownResult(
                kind=row[0],
                jobs=int(row[1] or 0),
                input_tokens=int(row[2] or 0),
                output_tokens=int(row[3] or 0),
                cache_read_tokens=int(row[4] or 0),
                cache_creation_tokens=int(row[5] or 0),
                total_tokens=int(row[6] or 0),
                cost_usd=round(float(row[7] or 0.0), 4),
            )
            for row in rows
        ]
        # Worst offender first — this ordering is the bar chart.
        return sorted(results, key=lambda r: r.total_tokens, reverse=True)

    def _model_rows(self, since: datetime | None) -> list[ModelBreakdownResult]:
        input_expr = _usage_int("input_tokens")
        output_expr = _usage_int("output_tokens")
        cache_read_expr = _usage_int("cache_read_input_tokens")
        cache_creation_expr = _usage_int("cache_creation_input_tokens")
        total_expr = input_expr + output_expr + cache_read_expr + cache_creation_expr
        # The model the job *requested* (payload["model"]); jobs enqueued before the model was
        # ever set fall into one labeled bucket rather than vanishing from the sum.
        model_expr = func.coalesce(JobRow.payload["model"].as_string(), "(engine default)")

        stmt = select(
            model_expr, func.count(JobRow.id), total_expr, _usage_cost()
        ).group_by(model_expr)
        if since is not None:
            stmt = stmt.where(JobRow.created_at >= since)
        rows = self._session.execute(stmt).all()
        results = [
            ModelBreakdownResult(
                model=row[0],
                jobs=int(row[1] or 0),
                total_tokens=int(row[2] or 0),
                cost_usd=round(float(row[3] or 0.0), 4),
            )
            for row in rows
        ]
        return sorted(results, key=lambda r: r.total_tokens, reverse=True)
