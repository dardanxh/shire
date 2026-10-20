"""Pure Launchpad rules — no SQLAlchemy, no I/O, so every rule here is unit-testable.

- frecency: a decayed visit counter (half-life `FRECENCY_HALF_LIFE_DAYS`)
- cadence: `manual | every:<N>m | every:<N>h | hourly | daily | weekly | weekdays | cron:<expr>`
- MCP tool permissions: write-type tools (mcp.domain.is_write_tool) denied unless opted in
- action results: the structured block the agent returns, and the "notify me?" rule
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from cronsim import CronSim, CronSimError

from shire.domain.mcp.domain import is_write_tool, server_tool_prefix

# --- frecency -----------------------------------------------------------------------------

FRECENCY_HALF_LIFE_DAYS = 14.0
FRECENCY_DECAY_PER_SECOND = math.log(2) / (FRECENCY_HALF_LIFE_DAYS * 86_400)


def frecency_now(score: float, last_visited_at: datetime | None, now: datetime) -> float:
    """The stored score decayed from its last visit to `now`."""
    if last_visited_at is None or score <= 0:
        return 0.0
    elapsed = max((now - last_visited_at).total_seconds(), 0.0)
    return score * math.exp(-FRECENCY_DECAY_PER_SECOND * elapsed)


def frecency_after_visit(score: float, last_visited_at: datetime | None, now: datetime) -> float:
    return frecency_now(score, last_visited_at, now) + 1.0


# --- cadence ------------------------------------------------------------------------------

_PRESET_CRON = {
    "hourly": "0 * * * *",
    "daily": "0 9 * * *",
    "weekdays": "0 9 * * 1-5",
    "weekly": "0 9 * * 1",
}
_EVERY = re.compile(r"^every:(\d+)([mh])$")
MIN_INTERVAL_MINUTES = 5


class CadenceError(ValueError):
    pass


def _zone(tz: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz or "UTC")
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise CadenceError(f"Unknown timezone {tz!r}.") from exc


def validate_cadence(cadence: str, tz: str = "UTC") -> str:
    """Normalize and validate; raises CadenceError with a user-facing message."""
    cadence = (cadence or "").strip()
    _zone(tz)
    if cadence == "manual" or cadence in _PRESET_CRON:
        return cadence
    if match := _EVERY.match(cadence):
        minutes = int(match.group(1)) * (60 if match.group(2) == "h" else 1)
        if minutes < MIN_INTERVAL_MINUTES:
            raise CadenceError(f"Run at most every {MIN_INTERVAL_MINUTES} minutes.")
        return cadence
    if cadence.startswith("cron:"):
        expr = cadence[len("cron:") :].strip()
        try:
            CronSim(expr, datetime.now(_zone(tz)))
        except CronSimError as exc:
            raise CadenceError(f"Invalid cron expression: {expr!r}") from exc
        return f"cron:{expr}"
    raise CadenceError(
        f"Unknown cadence {cadence!r}. Use manual, every:<N>m, every:<N>h, hourly, daily, "
        "weekdays, weekly, or cron:<expr>."
    )


def next_run_after(cadence: str, after: datetime, tz: str = "UTC") -> datetime | None:
    """The first scheduled time strictly after `after` (aware), or None for manual."""
    cadence = validate_cadence(cadence, tz)
    if cadence == "manual":
        return None
    if match := _EVERY.match(cadence):
        minutes = int(match.group(1)) * (60 if match.group(2) == "h" else 1)
        return after + timedelta(minutes=minutes)
    expr = _PRESET_CRON.get(cadence) or cadence[len("cron:") :]
    local = after.astimezone(_zone(tz))
    return next(CronSim(expr, local)).astimezone(after.tzinfo)


# --- MCP tool safety ----------------------------------------------------------------------

def tool_permissions(
    servers: list[str], tools_by_server: dict[str, list[str]], *, allow_writes: bool
) -> tuple[list[str], list[str]]:
    """(allowed_tools, disallowed_tools) for an action run. Deny beats allow in the CLI, so
    allowing the whole server and denying its write tools by exact name is enforced, not
    advisory."""
    allowed = [server_tool_prefix(s) for s in servers]
    denied: list[str] = []
    if not allow_writes:
        for server in servers:
            denied.extend(t for t in tools_by_server.get(server, []) if is_write_tool(t))
    return allowed, denied


# Built-ins an action never needs: it reports from MCP data, it doesn't touch the host.
ACTION_DENY_BUILTINS = (
    "Bash", "BashOutput", "Edit", "Glob", "Grep", "KillShell", "NotebookEdit", "Read",
    "Task", "TodoWrite", "Write",
)


# --- action results -----------------------------------------------------------------------

OUTCOMES = ("attention", "clear")


@dataclass
class ActionItem:
    key: str
    title: str
    url: str | None = None
    detail: str | None = None
    is_new: bool = False

    def as_dict(self) -> dict:
        return {
            "key": self.key, "title": self.title, "url": self.url, "detail": self.detail,
            "is_new": self.is_new,
        }


@dataclass
class ActionReport:
    outcome: str
    summary: str
    items: list[ActionItem] = field(default_factory=list)


def _extract_json(text: str) -> str | None:
    marker = text.rfind("```json")
    if marker != -1:
        after = text.find("\n", marker)
        close = text.rfind("```")
        if after != -1 and close > after:
            return text[after:close].strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    return match.group(0) if match else None


def _clip(value: object, limit: int) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text[:limit] if text else None


def parse_report(text: str) -> ActionReport | None:
    """The agent's fenced JSON report, tolerantly read; None when there is none."""
    block = _extract_json(text or "")
    if block is None:
        return None
    try:
        data = json.loads(block)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    raw_items = data.get("items") if isinstance(data.get("items"), list) else []
    items: list[ActionItem] = []
    seen: set[str] = set()
    for raw in raw_items[:100]:
        if not isinstance(raw, dict):
            continue
        title = _clip(raw.get("title"), 500)
        key = _clip(raw.get("key"), 300) or _clip(raw.get("url"), 300) or title
        if not key or not title or key in seen:
            continue
        seen.add(key)
        url = _clip(raw.get("url"), 2048)
        items.append(ActionItem(
            key=key, title=title,
            url=url if url and url.startswith(("http://", "https://")) else None,
            detail=_clip(raw.get("detail"), 2000),
        ))
    outcome = str(data.get("outcome") or "").strip().lower()
    if outcome not in OUTCOMES:
        outcome = "attention" if items else "clear"
    summary = _clip(data.get("summary"), 4000) or ("Nothing needs you." if not items else "")
    return ActionReport(outcome=outcome, summary=summary, items=items)


def mark_new(items: list[ActionItem], seen_keys: list[str]) -> int:
    seen = set(seen_keys)
    for item in items:
        item.is_new = item.key not in seen
    return sum(item.is_new for item in items)


SEEN_KEYS_LIMIT = 2_000


def merge_seen(seen_keys: list[str], items: list[ActionItem]) -> list[str]:
    merged = list(dict.fromkeys([*seen_keys, *(i.key for i in items)]))
    return merged[-SEEN_KEYS_LIMIT:]


def should_notify(outcome: str, new_count: int, notify_on: str) -> bool:
    if outcome == "error" or notify_on == "always":
        return True
    if outcome != "attention":
        return False
    return notify_on == "any_attention" or new_count > 0
