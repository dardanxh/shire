"""Read Claude Code's own local data: who the subscription belongs to, and how much the whole
machine has spent — across every project, not just Shire.

Three sources, all owned by the Claude Code CLI:

- ``~/.claude.json`` → ``oauthAccount`` — the subscription identity (plan, tier, billing).
- ``~/.claude/projects/<dir>/*.jsonl`` — per-session transcripts. Assistant events carry
  ``message.usage`` + ``timestamp`` + ``message.model``, which is what monthly machine-wide
  totals are aggregated from (the same source the ccusage tool reads).
- ``~/.claude/stats-cache.json`` — the CLI's own lifetime aggregate per model. Cheap to read
  but carries no month boundaries and refreshes only occasionally, so it serves as the
  lifetime figure and the fallback when transcripts are unreadable.

Everything here degrades to ``None`` rather than raising: the files belong to another program
that rewrites them while we read (a torn read through a macOS single-file bind mount is a known
failure mode — see docker-compose.claude.yml), and a missing dir just means the deployment
can't see the host's Claude data.

Local data never contains computed cost (``costUSD`` is always 0), so machine-wide cost is
**estimated** from tokens x the pricing table below. Shire's own jobs carry real cost from the
CLI envelope and are accounted in the jobs table, not here.

Parse cost: the transcript corpus is hundreds of MB, so three mitigations are load-bearing —
an mtime gate (a file untouched since before the month started cannot contain that month's
events), a per-file ``(mtime, size)`` incremental cache, and a short TTL on the whole scan.
The first request of a session may still take a few seconds; everything after is cache hits.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

logger = logging.getLogger(__name__)

# --- pricing -----------------------------------------------------------------------------------

# $ per 1M tokens (input, output), matched by longest model-id prefix. Verified against the
# Claude API pricing reference on 2026-08-09 — these WILL go stale; this dict is the single
# place to update when Anthropic ships new models or prices. Cache reads bill at 0.1x input;
# cache writes at 1.25x input (5-minute TTL writes; we don't distinguish the rarer 1h tier).
_PRICING_PER_MTOK: dict[str, tuple[float, float]] = {
    "claude-fable-5": (10.0, 50.0),
    "claude-mythos-5": (10.0, 50.0),
    "claude-opus-4-5": (5.0, 25.0),
    "claude-opus-4-6": (5.0, 25.0),
    "claude-opus-4-7": (5.0, 25.0),
    "claude-opus-4-8": (5.0, 25.0),
    # Opus 4.0/4.1 (incl. dated ids like claude-opus-4-20250514) — the pre-4.5 pricing tier.
    "claude-opus-4": (15.0, 75.0),
    "claude-sonnet-4": (3.0, 15.0),  # 4.0 / 4.5 / 4.6
    "claude-haiku-4-5": (1.0, 5.0),
}
# Unknown models (e.g. the claude-opus-5 / claude-sonnet-5 aliases the engine already offers)
# estimate at Opus tier and are surfaced in `unknown_models` so the UI can say "estimated".
_FALLBACK_PRICING = (5.0, 25.0)

_CACHE_READ_FACTOR = 0.1
_CACHE_WRITE_FACTOR = 1.25


def _pricing_for(model: str) -> tuple[tuple[float, float], bool]:
    """Longest-prefix match into the pricing table. Returns ((in, out), known)."""
    best: str | None = None
    for prefix in _PRICING_PER_MTOK:
        if model.startswith(prefix) and (best is None or len(prefix) > len(best)):
            best = prefix
    if best is None:
        return _FALLBACK_PRICING, False
    return _PRICING_PER_MTOK[best], True


# --- value objects -----------------------------------------------------------------------------


@dataclass
class TokenCounts:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_input_tokens: int = 0
    cache_creation_input_tokens: int = 0

    def add(self, other: TokenCounts) -> None:
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens
        self.cache_read_input_tokens += other.cache_read_input_tokens
        self.cache_creation_input_tokens += other.cache_creation_input_tokens

    @property
    def total(self) -> int:
        return (
            self.input_tokens
            + self.output_tokens
            + self.cache_read_input_tokens
            + self.cache_creation_input_tokens
        )

    def cost_usd(self, model: str) -> tuple[float, bool]:
        """Estimated cost of these tokens on this model. Returns (usd, priced_from_table)."""
        (p_in, p_out), known = _pricing_for(model)
        usd = (
            self.input_tokens * p_in
            + self.output_tokens * p_out
            + self.cache_read_input_tokens * p_in * _CACHE_READ_FACTOR
            + self.cache_creation_input_tokens * p_in * _CACHE_WRITE_FACTOR
        ) / 1_000_000
        return usd, known


@dataclass
class MachineUsage:
    """Machine-wide usage for one scope (a month, or lifetime)."""

    total_tokens: int
    cost_usd_estimated: float
    unknown_models: list[str]
    per_model: dict[str, TokenCounts] = field(default_factory=dict)
    # Only set for the stats-cache lifetime figure: when the CLI last recomputed it.
    as_of: str | None = None


@dataclass(frozen=True)
class Subscription:
    organization_type: str | None
    rate_limit_tier: str | None
    billing_type: str | None
    email: str | None


@dataclass(frozen=True)
class ClaudeDataLocation:
    """Where Claude's local data lives for this deployment, or why it doesn't."""

    data_dir: Path | None
    config_file: Path | None
    reason: str | None  # None when data_dir is usable; "dir_not_found" otherwise


# --- resolution --------------------------------------------------------------------------------


def resolve_location() -> ClaudeDataLocation:
    """Explicit settings win; else auto-detect the home-dir defaults (native dev); else
    unavailable. Containerized deploys opt in via the claude-data compose overlay — the
    consent-first pattern: nothing is read unless the operator granted the mount."""
    from shire.core.settings import get_settings

    settings = get_settings()
    data_dir = settings.claude_data_dir or Path.home() / ".claude"
    config_file = settings.claude_config_file or Path.home() / ".claude.json"
    readable_config = config_file if config_file.is_file() else None
    if not data_dir.is_dir():
        return ClaudeDataLocation(None, readable_config, "dir_not_found")
    return ClaudeDataLocation(data_dir, readable_config, None)


# --- subscription ------------------------------------------------------------------------------

_SUBSCRIPTION_TTL_SECONDS = 60.0
_subscription_cache: tuple[float, Subscription | None] = (0.0, None)
_subscription_lock = threading.Lock()


def read_subscription(config_file: Path | None) -> Subscription | None:
    """The subscription identity from ``~/.claude.json``'s ``oauthAccount``.

    Never raises: the CLI rewrites this file while we read it, so a torn/partial read is a
    normal event, answered with ``None`` (the UI shows the card as unavailable and the next
    poll usually succeeds).
    """
    global _subscription_cache
    if config_file is None:
        return None
    with _subscription_lock:
        cached_at, cached = _subscription_cache
        if time.monotonic() - cached_at < _SUBSCRIPTION_TTL_SECONDS and cached is not None:
            return cached
        try:
            account = json.loads(config_file.read_text()).get("oauthAccount") or {}
            subscription = Subscription(
                organization_type=account.get("organizationType"),
                rate_limit_tier=account.get("organizationRateLimitTier"),
                billing_type=account.get("billingType"),
                email=account.get("emailAddress"),
            )
        except (OSError, ValueError, AttributeError):
            return cached  # torn read — serve the last good answer if there is one
        _subscription_cache = (time.monotonic(), subscription)
        return subscription


# --- transcript aggregation --------------------------------------------------------------------

_SCAN_TTL_SECONDS = 60.0

# path -> (mtime, size, entries). Entries keep the dedupe key so resumed sessions replayed
# across files still count once when merged; memory stays bounded because the mtime gate keeps
# anything untouched since before the requested month out of the cache entirely.
_file_cache: dict[str, tuple[float, int, dict[str, tuple[str, str, TokenCounts]]]] = {}
_scan_cache: dict[str, tuple[float, MachineUsage]] = {}
_scan_lock = threading.Lock()


def monthly_usage(data_dir: Path, month: str, *, refresh: bool = False) -> MachineUsage | None:
    """Machine-wide token usage for one UTC month ("YYYY-MM"), from the transcripts.

    Cost is estimated from the pricing table (local transcripts never carry cost). Returns
    ``None`` when the projects directory is unreadable.
    """
    projects = data_dir / "projects"
    if not projects.is_dir():
        return None
    with _scan_lock:
        cached = _scan_cache.get(month)
        if cached is not None and not refresh:
            cached_at, usage = cached
            if time.monotonic() - cached_at < _SCAN_TTL_SECONDS:
                return usage
        usage = _scan(projects, month)
        _scan_cache[month] = (time.monotonic(), usage)
        return usage


def _scan(projects: Path, month: str) -> MachineUsage:
    month_start = datetime.strptime(month, "%Y-%m").replace(tzinfo=UTC).timestamp()
    merged: dict[str, tuple[str, str, TokenCounts]] = {}
    for path in sorted(projects.glob("*/*.jsonl")):
        try:
            stat = path.stat()
        except OSError:
            continue
        # A file last written before the month began cannot contain events for it. This gate
        # is what keeps the multi-hundred-MB corpus out of the hot path.
        if stat.st_mtime < month_start:
            continue
        key = str(path)
        cached = _file_cache.get(key)
        if cached is not None and cached[0] == stat.st_mtime and cached[1] == stat.st_size:
            entries = cached[2]
        else:
            entries = _parse_transcript(path)
            _file_cache[key] = (stat.st_mtime, stat.st_size, entries)
        # First occurrence wins: resumed sessions replay the same events into new files.
        for dedupe_key, entry in entries.items():
            merged.setdefault(dedupe_key, entry)

    per_model: dict[str, TokenCounts] = {}
    for entry_month, model, counts in merged.values():
        if entry_month != month:
            continue
        per_model.setdefault(model, TokenCounts()).add(counts)

    total_tokens = 0
    cost = 0.0
    unknown: set[str] = set()
    for model, counts in per_model.items():
        total_tokens += counts.total
        usd, known = counts.cost_usd(model)
        cost += usd
        if not known:
            unknown.add(model)
    return MachineUsage(
        total_tokens=total_tokens,
        cost_usd_estimated=round(cost, 2),
        unknown_models=sorted(unknown),
        per_model=per_model,
    )


def _parse_transcript(path: Path) -> dict[str, tuple[str, str, TokenCounts]]:
    """One session file → {dedupe_key: (month, model, tokens)} for its assistant events.

    Malformed lines are another program's business, not an error — skipped silently.
    """
    entries: dict[str, tuple[str, str, TokenCounts]] = {}
    try:
        with path.open(encoding="utf-8", errors="replace") as handle:
            for lineno, line in enumerate(handle):
                try:
                    event = json.loads(line)
                except ValueError:
                    continue
                if not isinstance(event, dict) or event.get("type") != "assistant":
                    continue
                message = event.get("message")
                timestamp = event.get("timestamp")
                if not isinstance(message, dict) or not isinstance(timestamp, str):
                    continue
                usage = message.get("usage")
                if not isinstance(usage, dict):
                    continue
                counts = TokenCounts(
                    input_tokens=int(usage.get("input_tokens") or 0),
                    output_tokens=int(usage.get("output_tokens") or 0),
                    cache_read_input_tokens=int(usage.get("cache_read_input_tokens") or 0),
                    cache_creation_input_tokens=int(
                        usage.get("cache_creation_input_tokens") or 0
                    ),
                )
                model = str(message.get("model") or "unknown")
                if model == "<synthetic>":
                    # Client-generated events (local notices etc.) — not API calls, not billed.
                    continue
                message_id = message.get("id")
                request_id = event.get("requestId")
                dedupe_key = (
                    f"{message_id}:{request_id}"
                    if message_id and request_id
                    else f"{path}:{lineno}"  # no ids → cannot be a replay, count once
                )
                entries[dedupe_key] = (timestamp[:7], model, counts)
    except OSError:
        return {}
    return entries


# --- lifetime fallback (stats-cache.json) ------------------------------------------------------


def lifetime_usage(data_dir: Path) -> MachineUsage | None:
    """The CLI's own lifetime aggregate — instant to read, no month boundaries, and refreshed
    only when the CLI recomputes its stats (`as_of` tells the UI how stale it is)."""
    try:
        stats = json.loads((data_dir / "stats-cache.json").read_text())
    except (OSError, ValueError):
        return None
    model_usage = stats.get("modelUsage")
    if not isinstance(model_usage, dict):
        return None

    per_model: dict[str, TokenCounts] = {}
    for model, raw in model_usage.items():
        if not isinstance(raw, dict):
            continue
        per_model[model] = TokenCounts(
            input_tokens=int(raw.get("inputTokens") or 0),
            output_tokens=int(raw.get("outputTokens") or 0),
            cache_read_input_tokens=int(raw.get("cacheReadInputTokens") or 0),
            cache_creation_input_tokens=int(raw.get("cacheCreationInputTokens") or 0),
        )

    total_tokens = 0
    cost = 0.0
    unknown: set[str] = set()
    for model, counts in per_model.items():
        total_tokens += counts.total
        usd, known = counts.cost_usd(model)
        cost += usd
        if not known:
            unknown.add(model)
    return MachineUsage(
        total_tokens=total_tokens,
        cost_usd_estimated=round(cost, 2),
        unknown_models=sorted(unknown),
        per_model=per_model,
        as_of=stats.get("lastComputedDate"),
    )


def _reset_caches() -> None:
    """Test hook: module-level caches survive between tests otherwise."""
    global _subscription_cache
    with _subscription_lock:
        _subscription_cache = (0.0, None)
    with _scan_lock:
        _file_cache.clear()
        _scan_cache.clear()
