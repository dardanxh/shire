"""Pure-function tests for the Launchpad rules and the MCP probe parsing."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from shire.domain.launchpad.domain import (
    FRECENCY_HALF_LIFE_DAYS,
    ActionItem,
    CadenceError,
    frecency_after_visit,
    frecency_now,
    mark_new,
    merge_seen,
    next_run_after,
    parse_report,
    should_notify,
    tool_permissions,
    validate_cadence,
)
from shire.domain.mcp.domain import is_write_tool, parse_mcp_list, server_tool_prefix
from shire.integrations.favicon import icon_candidates

NOW = datetime(2026, 10, 20, 12, 0, tzinfo=UTC)

# Captured verbatim from `claude mcp list` on the operator's host.
MCP_LIST_OUTPUT = """Checking MCP server health…

claude.ai PPRO Miro: https://miro.global-mcp-gateway.live.deven-di.ppro.com/mcp - ✔ Connected
claude.ai PPRO Plugins: https://ppro-plugins.global-mcp-gateway.live.deven-di.ppro.com/mcp - ! Needs authentication
claude.ai PPRO GitHub: https://github.global-mcp-gateway.live.deven-di.ppro.com/mcp - ✔ Connected
claude.ai Similarweb: https://mcp.similarweb.com - ! Needs authentication
claude.ai PPRO Atlassian: https://atlassian.global-mcp-gateway.live.deven-di.ppro.com/mcp - ✔ Connected
local-thing: uv run python -m shire.agent.mcp_server - ✗ Failed to connect
"""  # noqa: E501


# --- frecency -----------------------------------------------------------------------------


def test_frecency_halves_after_half_life() -> None:
    later = NOW + timedelta(days=FRECENCY_HALF_LIFE_DAYS)
    assert frecency_now(8.0, NOW, later) == pytest.approx(4.0)


def test_frecency_visit_adds_one_to_decayed_score() -> None:
    assert frecency_after_visit(0.0, None, NOW) == 1.0
    assert frecency_after_visit(2.0, NOW, NOW) == pytest.approx(3.0)


def test_recent_light_use_beats_old_heavy_use() -> None:
    old_heavy = frecency_now(20.0, NOW - timedelta(days=120), NOW)
    recent_light = frecency_now(3.0, NOW - timedelta(days=1), NOW)
    assert recent_light > old_heavy


# --- cadence ------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "cadence",
    [
        "manual", "hourly", "daily", "weekdays", "weekly", "every:15m", "every:2h",
        "cron:*/10 * * * *",
    ],
)
def test_valid_cadences(cadence: str) -> None:
    assert validate_cadence(cadence) == cadence


@pytest.mark.parametrize("cadence", ["", "sometimes", "every:1m", "every:0h", "cron:", "cron:nope"])
def test_invalid_cadences(cadence: str) -> None:
    with pytest.raises(CadenceError):
        validate_cadence(cadence)


def test_unknown_timezone_rejected() -> None:
    with pytest.raises(CadenceError):
        validate_cadence("daily", "Mars/Olympus")


def test_next_run_interval_and_manual() -> None:
    assert next_run_after("manual", NOW) is None
    assert next_run_after("every:15m", NOW) == NOW + timedelta(minutes=15)


def test_next_run_cron_respects_timezone() -> None:
    # 12:00 UTC is 14:00 in Berlin (CEST): the next 09:00 Berlin weekday is tomorrow 07:00 UTC.
    nxt = next_run_after("weekdays", NOW, "Europe/Berlin")
    assert nxt == datetime(2026, 10, 21, 7, 0, tzinfo=UTC)


def test_next_run_weekdays_skips_weekend() -> None:
    friday_noon = datetime(2026, 10, 23, 12, 0, tzinfo=UTC)
    assert next_run_after("weekdays", friday_noon).weekday() == 0


# --- MCP ----------------------------------------------------------------------------------


def test_parse_mcp_list() -> None:
    servers = {s.name: s for s in parse_mcp_list(MCP_LIST_OUTPUT)}
    assert set(servers) == {
        "claude.ai PPRO Miro", "claude.ai PPRO Plugins", "claude.ai PPRO GitHub",
        "claude.ai Similarweb", "claude.ai PPRO Atlassian", "local-thing",
    }
    assert servers["claude.ai PPRO Atlassian"].status == "connected"
    assert servers["claude.ai PPRO Atlassian"].target.startswith("https://atlassian.")
    assert servers["claude.ai PPRO Plugins"].status == "needs_auth"
    assert servers["local-thing"].status == "failed"
    assert servers["local-thing"].target == "uv run python -m shire.agent.mcp_server"


def test_parse_mcp_list_empty() -> None:
    assert parse_mcp_list("No MCP servers configured. Use `claude mcp add` to add a server.") == []


def test_server_tool_prefix() -> None:
    assert server_tool_prefix("claude.ai PPRO Google Workspace") == (
        "mcp__claude_ai_PPRO_Google_Workspace"
    )


@pytest.mark.parametrize(
    "tool",
    [
        "mcp__claude_ai_PPRO_Atlassian__createJiraIssue",
        "mcp__claude_ai_PPRO_Atlassian__addOrEditJiraIssueComment",
        "mcp__claude_ai_PPRO_Atlassian__transitionJiraIssue",
        "mcp__claude_ai_PPRO_Atlassian__executeWrite",
        "mcp__claude_ai_PPRO_GitHub__push_files",
        "mcp__claude_ai_PPRO_GitHub__issue_write",
        "mcp__claude_ai_PPRO_Google_Workspace__modify_sheet_values",
        "mcp__claude_ai_PPRO_Google_Workspace__find_and_replace_doc",
        "mcp__claude_ai_PPRO_Miro__comment_resolve",
    ],
)
def test_write_tools_detected(tool: str) -> None:
    assert is_write_tool(tool)


@pytest.mark.parametrize(
    "tool",
    [
        "mcp__claude_ai_PPRO_Atlassian__searchJiraIssuesUsingJql",
        "mcp__claude_ai_PPRO_Atlassian__getJiraIssue",
        "mcp__claude_ai_PPRO_Atlassian__executeRead",
        "mcp__claude_ai_PPRO_BigQuery__execute_sql",
        "mcp__claude_ai_PPRO_GitHub__list_pull_requests",
        "mcp__claude_ai_PPRO_Miro__comment_list_comments",
        "mcp__claude_ai_PPRO_Google_Workspace__read_sheet_values",
    ],
)
def test_read_tools_allowed(tool: str) -> None:
    assert not is_write_tool(tool)


def test_tool_permissions_deny_writes_unless_opted_in() -> None:
    tools = {
        "claude.ai PPRO Atlassian": [
            "mcp__claude_ai_PPRO_Atlassian__getJiraIssue",
            "mcp__claude_ai_PPRO_Atlassian__createJiraIssue",
        ]
    }
    allowed, denied = tool_permissions(["claude.ai PPRO Atlassian"], tools, allow_writes=False)
    assert allowed == ["mcp__claude_ai_PPRO_Atlassian"]
    assert denied == ["mcp__claude_ai_PPRO_Atlassian__createJiraIssue"]
    _, denied = tool_permissions(["claude.ai PPRO Atlassian"], tools, allow_writes=True)
    assert denied == []


# --- action reports -----------------------------------------------------------------------


def test_parse_report_fenced() -> None:
    text = """I checked the board.

```json
{"outcome": "attention", "summary": "2 new requests",
 "items": [
   {"key": "DATA-12", "title": "BQ access for Ana", "url": "https://jira.example/DATA-12",
    "detail": "grant viewer on analytics"},
   {"key": "DATA-12", "title": "duplicate"},
   {"key": "DATA-13", "title": "BQ access for Bo", "url": "javascript:alert(1)"}
 ]}
```"""
    report = parse_report(text)
    assert report is not None
    assert report.outcome == "attention"
    assert [i.key for i in report.items] == ["DATA-12", "DATA-13"]
    assert report.items[1].url is None  # non-http links dropped


def test_parse_report_infers_outcome_and_rejects_garbage() -> None:
    report = parse_report('{"summary": "all quiet", "items": []}')
    assert report is not None and report.outcome == "clear"
    assert parse_report("no json here") is None


def test_new_item_diffing_and_seen_merge() -> None:
    items = [ActionItem(key="A", title="a"), ActionItem(key="B", title="b")]
    assert mark_new(items, ["A"]) == 1
    assert [i.is_new for i in items] == [False, True]
    assert merge_seen(["A"], items) == ["A", "B"]


@pytest.mark.parametrize(
    ("outcome", "new", "notify_on", "expected"),
    [
        ("attention", 1, "new_items", True),
        ("attention", 0, "new_items", False),
        ("attention", 0, "any_attention", True),
        ("clear", 0, "any_attention", False),
        ("clear", 0, "always", True),
        ("error", 0, "new_items", True),
    ],
)
def test_should_notify(outcome: str, new: int, notify_on: str, expected: bool) -> None:
    assert should_notify(outcome, new, notify_on) is expected


# --- favicon ------------------------------------------------------------------------------


def test_icon_candidates_prefer_touch_icon_and_resolve_relative() -> None:
    html = (
        '<link rel="icon" href="/favicon-32.png">'
        '<link rel="stylesheet" href="/x.css">'
        '<link href="icons/apple.png" rel="apple-touch-icon">'
    )
    assert icon_candidates("https://jira.example/browse/X", html) == [
        "https://jira.example/browse/icons/apple.png",
        "https://jira.example/favicon-32.png",
    ]
