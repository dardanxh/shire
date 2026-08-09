"""The claude_data adapter: transcript aggregation, dedupe, gating, pricing, degradation.

Synthetic ~/.claude trees under tmp_path — the adapter must never raise, whatever the CLI
left on disk.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from shire.integrations import claude_data
from shire.integrations.claude_data import (
    TokenCounts,
    _pricing_for,
    lifetime_usage,
    monthly_usage,
    read_subscription,
)


@pytest.fixture(autouse=True)
def _fresh_caches():
    claude_data._reset_caches()
    yield
    claude_data._reset_caches()


def _assistant_line(
    *,
    message_id: str | None = "msg_1",
    request_id: str | None = "req_1",
    timestamp: str = "2026-08-05T10:00:00.000Z",
    model: str = "claude-sonnet-4-6",
    input_tokens: int = 100,
    output_tokens: int = 50,
    cache_read: int = 0,
    cache_creation: int = 0,
) -> str:
    event: dict = {
        "type": "assistant",
        "timestamp": timestamp,
        "message": {
            "id": message_id,
            "model": model,
            "usage": {
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cache_read_input_tokens": cache_read,
                "cache_creation_input_tokens": cache_creation,
            },
        },
    }
    if request_id is not None:
        event["requestId"] = request_id
    return json.dumps(event)


def _write_transcript(projects: Path, project: str, name: str, lines: list[str]) -> Path:
    directory = projects / project
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / name
    path.write_text("\n".join(lines) + "\n")
    return path


# --- monthly aggregation -----------------------------------------------------------------------


def test_monthly_usage_aggregates_the_requested_month_only(tmp_path: Path) -> None:
    projects = tmp_path / "projects"
    _write_transcript(
        projects,
        "proj-a",
        "s1.jsonl",
        [
            _assistant_line(message_id="m1", request_id="r1", timestamp="2026-08-05T10:00:00Z"),
            _assistant_line(message_id="m2", request_id="r2", timestamp="2026-08-06T10:00:00Z"),
            # July event in an August-touched file: parsed, but excluded from the 2026-08 sum.
            _assistant_line(message_id="m3", request_id="r3", timestamp="2026-07-30T10:00:00Z"),
        ],
    )

    usage = monthly_usage(tmp_path, "2026-08")
    assert usage is not None
    assert usage.total_tokens == 2 * 150
    assert usage.per_model["claude-sonnet-4-6"].input_tokens == 200


def test_monthly_usage_dedupes_replayed_events_across_files(tmp_path: Path) -> None:
    projects = tmp_path / "projects"
    line = _assistant_line(message_id="m1", request_id="r1")
    _write_transcript(projects, "proj-a", "s1.jsonl", [line])
    # A resumed session replays the same event into a second file.
    _write_transcript(projects, "proj-a", "s2.jsonl", [line, _assistant_line(message_id="m2")])

    usage = monthly_usage(tmp_path, "2026-08")
    assert usage is not None
    assert usage.total_tokens == 2 * 150  # m1 counted once, m2 once


def test_monthly_usage_counts_id_less_events_once_each(tmp_path: Path) -> None:
    projects = tmp_path / "projects"
    _write_transcript(
        projects,
        "proj-a",
        "s1.jsonl",
        [
            _assistant_line(message_id=None, request_id=None),
            _assistant_line(message_id=None, request_id=None),
        ],
    )
    usage = monthly_usage(tmp_path, "2026-08")
    assert usage is not None
    assert usage.total_tokens == 2 * 150


def test_monthly_usage_skips_files_untouched_since_before_the_month(tmp_path: Path) -> None:
    projects = tmp_path / "projects"
    stale = _write_transcript(
        projects, "proj-old", "old.jsonl", [_assistant_line(message_id="m9", request_id="r9")]
    )
    # mtime says June; the scan must not even open it for an August query.
    june = 1_780_000_000  # 2026-05-28 — safely before 2026-08
    os.utime(stale, (june, june))
    fresh = _write_transcript(
        projects, "proj-new", "new.jsonl", [_assistant_line(message_id="m1", request_id="r1")]
    )
    assert fresh.stat().st_mtime > june

    usage = monthly_usage(tmp_path, "2026-08")
    assert usage is not None
    assert usage.total_tokens == 150


def test_monthly_usage_tolerates_malformed_lines(tmp_path: Path) -> None:
    projects = tmp_path / "projects"
    _write_transcript(
        projects,
        "proj-a",
        "s1.jsonl",
        [
            "not json at all {{{",
            json.dumps({"type": "summary", "leafUuid": "x"}),
            json.dumps(
                {"type": "assistant", "message": "no", "timestamp": "2026-08-01T00:00:00Z"}
            ),
            _assistant_line(message_id="m1", request_id="r1"),
        ],
    )
    usage = monthly_usage(tmp_path, "2026-08")
    assert usage is not None
    assert usage.total_tokens == 150


def test_monthly_usage_none_without_projects_dir(tmp_path: Path) -> None:
    assert monthly_usage(tmp_path / "nope", "2026-08") is None


def test_monthly_usage_reparses_a_grown_file(tmp_path: Path) -> None:
    projects = tmp_path / "projects"
    path = _write_transcript(
        projects, "proj-a", "s1.jsonl", [_assistant_line(message_id="m1", request_id="r1")]
    )
    assert monthly_usage(tmp_path, "2026-08", refresh=True).total_tokens == 150

    with path.open("a") as handle:
        handle.write(_assistant_line(message_id="m2", request_id="r2") + "\n")
    assert monthly_usage(tmp_path, "2026-08", refresh=True).total_tokens == 300


# --- pricing -----------------------------------------------------------------------------------


def test_pricing_prefix_matching() -> None:
    assert _pricing_for("claude-opus-4-8")[0] == (5.0, 25.0)
    # Dated id resolves through the longest matching prefix, not the legacy opus-4 tier.
    assert _pricing_for("claude-opus-4-5-20251101")[0] == (5.0, 25.0)
    assert _pricing_for("claude-opus-4-20250514")[0] == (15.0, 75.0)
    assert _pricing_for("claude-haiku-4-5-20251001")[0] == (1.0, 5.0)
    priced, known = _pricing_for("claude-opus-5")
    assert not known and priced == (5.0, 25.0)


def test_unknown_models_are_priced_by_fallback_and_reported(tmp_path: Path) -> None:
    projects = tmp_path / "projects"
    _write_transcript(
        projects,
        "proj-a",
        "s1.jsonl",
        [_assistant_line(model="claude-opus-5", input_tokens=1_000_000, output_tokens=0)],
    )
    usage = monthly_usage(tmp_path, "2026-08")
    assert usage is not None
    assert usage.unknown_models == ["claude-opus-5"]
    assert usage.cost_usd_estimated == 5.0  # 1M input at the opus-tier fallback


def test_cost_includes_cache_token_factors() -> None:
    counts = TokenCounts(
        input_tokens=1_000_000,
        output_tokens=0,
        cache_read_input_tokens=1_000_000,
        cache_creation_input_tokens=1_000_000,
    )
    usd, known = counts.cost_usd("claude-sonnet-4-6")
    assert known
    # 3.00 input + 0.30 cache-read + 3.75 cache-write
    assert usd == pytest.approx(7.05)


# --- subscription ------------------------------------------------------------------------------


def test_read_subscription(tmp_path: Path) -> None:
    config = tmp_path / "claude.json"
    config.write_text(
        json.dumps(
            {
                "oauthAccount": {
                    "organizationType": "claude_max",
                    "organizationRateLimitTier": "default_claude_max_20x",
                    "billingType": "stripe_subscription",
                    "emailAddress": "user@example.com",
                }
            }
        )
    )
    subscription = read_subscription(config)
    assert subscription is not None
    assert subscription.organization_type == "claude_max"
    assert subscription.rate_limit_tier == "default_claude_max_20x"


def test_read_subscription_degrades_on_missing_or_corrupt_file(tmp_path: Path) -> None:
    assert read_subscription(None) is None
    assert read_subscription(tmp_path / "missing.json") is None
    corrupt = tmp_path / "corrupt.json"
    corrupt.write_text("{ torn write")
    assert read_subscription(corrupt) is None


# --- lifetime fallback -------------------------------------------------------------------------


def test_lifetime_usage_reads_stats_cache(tmp_path: Path) -> None:
    (tmp_path / "stats-cache.json").write_text(
        json.dumps(
            {
                "lastComputedDate": "2026-07-19",
                "modelUsage": {
                    "claude-sonnet-4-6": {
                        "inputTokens": 1_000_000,
                        "outputTokens": 1_000_000,
                        "cacheReadInputTokens": 0,
                        "cacheCreationInputTokens": 0,
                        "costUSD": 0,
                    }
                },
            }
        )
    )
    usage = lifetime_usage(tmp_path)
    assert usage is not None
    assert usage.total_tokens == 2_000_000
    assert usage.cost_usd_estimated == pytest.approx(18.0)  # 3 + 15
    assert usage.as_of == "2026-07-19"


def test_lifetime_usage_degrades(tmp_path: Path) -> None:
    assert lifetime_usage(tmp_path) is None
    (tmp_path / "stats-cache.json").write_text("not json")
    assert lifetime_usage(tmp_path) is None
