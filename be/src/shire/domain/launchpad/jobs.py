"""Launchpad action jobs: the prompt contract and the completion handler.

The user writes *what to check* ("new BigQuery access requests in Jira project DATA"); the system
prompt below adds the reporting contract — one fenced JSON report with stable item keys — so the
handler can diff items against what was already reported and notify only on new ones.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from shire.core.db import unit_of_work
from shire.domain.jobs.models import JobRow
from shire.domain.launchpad.domain import (
    ActionItem,
    mark_new,
    merge_seen,
    parse_report,
    should_notify,
)
from shire.domain.launchpad.models import ActionRunRow, BookmarkActionRow

logger = logging.getLogger(__name__)

_SYSTEM = """\
You are a Launchpad action: a small, unattended check that runs on a schedule for one person \
and tells them only what needs their attention. Nobody is watching this run, so never ask \
questions — decide, do the check, report.

Context — the bookmark this action belongs to:
- Name: {name}
- URL: {url}
{description}
Use the MCP tools you have been given to do the check. {write_rule}

When you are done, end your reply with exactly ONE fenced ```json block, and nothing after it:

```json
{{
  "outcome": "attention" | "clear",
  "summary": "one or two sentences for a notification",
  "items": [
    {{"key": "stable id, e.g. the Jira issue key", "title": "short title", \
"url": "https://... link to open it", "detail": "what the person needs to do"}}
  ]
}}
```

Rules:
- "attention" means something needs the person; "clear" means nothing does (items may be empty).
- List EVERY currently matching item each run, not only ones you think are new — the system \
works out what is new from the keys, so keys must be stable across runs.
- Links must be real URLs from the tool results; never invent them.
- If a tool fails or you lack access, say so in "summary" and use outcome "attention".
"""

_READ_ONLY = (
    "This action is READ-ONLY: write-type tools are disabled. Do not try to change anything; "
    "describe what the person should do instead."
)
_WRITES_OK = (
    "This action MAY make changes with write tools, but only the changes the instructions "
    "explicitly ask for. Report every change you made as an item."
)


def build_system_prompt(
    *, name: str, url: str, description: str | None, allow_writes: bool
) -> str:
    return _SYSTEM.format(
        name=name,
        url=url,
        description=f"- Notes: {description}\n" if description else "",
        write_rule=_WRITES_OK if allow_writes else _READ_ONLY,
    )


def handle_launchpad_action(job: JobRow) -> None:
    run_id = uuid.UUID(job.payload["run_id"])
    with unit_of_work() as session:
        run = session.get(ActionRunRow, run_id)
        if run is None or run.status != "pending":
            return  # action deleted, or already settled by an earlier dispatch
        action = session.get(BookmarkActionRow, run.action_id)
        if action is None:
            return
        now = datetime.now(UTC)
        run.finished_at = now
        action.last_run_at = now

        if job.status != "succeeded":
            run.status = "error"
            run.outcome = "error"
            run.summary = job.error or "The action job failed."
            run.notify = should_notify("error", 0, action.notify_on)
            return

        report = parse_report(job.result or "")
        if report is None:
            run.status = "error"
            run.outcome = "error"
            run.summary = "The action finished but did not return its JSON report."
            run.notify = should_notify("error", 0, action.notify_on)
            return

        items: list[ActionItem] = report.items
        new_count = mark_new(items, list(action.seen_keys or []))
        action.seen_keys = merge_seen(list(action.seen_keys or []), items)
        run.status = "succeeded"
        run.outcome = report.outcome
        run.summary = report.summary
        run.items = [item.as_dict() for item in items]
        run.new_count = new_count
        run.notify = should_notify(report.outcome, new_count, action.notify_on)
