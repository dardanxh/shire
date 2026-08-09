"""Pydantic I/O schemas for the treasury domain (cost observability).

Two kinds of money appear here and the schemas keep them apart on purpose:

- **Shire figures are actual** — summed from the jobs table, whose `total_cost_usd` comes
  from the Claude CLI envelope at run time.
- **Machine-wide figures are estimated** — Claude's local data never contains computed cost,
  so they are tokens x a pricing table (models the table doesn't know are listed in
  `unknown_models` so the UI can label the estimate honestly).

The two can also overlap or be disjoint: in native dev the engine's runs land in the host's
~/.claude transcripts (Shire is a subset of the machine total), while in Docker the engine has
its own HOME and its transcripts never reach the host dir. `share_pct` is therefore clamped
and presented as "Shire vs what the machine's Claude data shows", not as an exact fraction.
"""

from __future__ import annotations

from pydantic import BaseModel


class SubscriptionResult(BaseModel):
    """The Claude subscription this machine is logged into (from ~/.claude.json)."""

    organization_type: str | None  # "claude_max" | "claude_pro" | ...
    rate_limit_tier: str | None  # e.g. "default_claude_max_20x"
    billing_type: str | None  # e.g. "stripe_subscription"
    email: str | None


class ClaudeDataStatusResult(BaseModel):
    """Whether this deployment can see Claude's local data, and why not when it can't."""

    available: bool
    reason: str | None  # "dir_not_found" when the ~/.claude dir isn't visible
    data_dir: str | None


class MonthTotalsResult(BaseModel):
    """This month's spend: machine-wide (estimated) next to Shire's own (actual)."""

    month: str  # "2026-08", UTC boundaries
    machine_total_tokens: int | None  # None when Claude data is unavailable
    machine_cost_usd_estimated: float | None
    unknown_models: list[str]
    shire_jobs: int
    shire_total_tokens: int
    shire_cost_usd: float
    share_pct: float | None  # min(100, shire/machine); None without machine data


class LifetimeTotalsResult(BaseModel):
    """All-time machine totals from Claude's own stats cache — cheap but refreshed only when
    the CLI recomputes it, so `as_of` says how stale the figure is."""

    machine_total_tokens: int
    machine_cost_usd_estimated: float
    as_of: str | None  # "YYYY-MM-DD" the CLI last computed its stats


class TreasuryOverviewResult(BaseModel):
    """The Treasury page's headline read: who's paying, and what this month cost."""

    claude_data: ClaudeDataStatusResult
    subscription: SubscriptionResult | None
    month: MonthTotalsResult
    lifetime: LifetimeTotalsResult | None


class KindBreakdownResult(BaseModel):
    """One AI action's totals over the window — the bar-chart row."""

    kind: str
    jobs: int
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int
    cache_creation_tokens: int
    total_tokens: int
    cost_usd: float


class ModelBreakdownResult(BaseModel):
    """One model's totals over the window (the model the job requested)."""

    model: str
    jobs: int
    total_tokens: int
    cost_usd: float


class TreasuryBreakdownResult(BaseModel):
    """Which actions eat the tokens: per-kind (ordered worst first) and per-model sums."""

    window: str
    kinds: list[KindBreakdownResult]
    models: list[ModelBreakdownResult]
