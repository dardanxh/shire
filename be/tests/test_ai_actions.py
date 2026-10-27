"""AI Actions: schedule + tool-policy + report rules (pure), and the service and completion
handler against SQLite with the job queue faked out."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from fnmatch import fnmatchcase
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from shire.core.exceptions import ConflictError, ValidationError
from shire.domain.ai_actions import domain
from shire.domain.ai_actions.jobs import apply_result
from shire.domain.ai_actions.models import AiActionRow
from shire.domain.ai_actions.schemas import CreateAiAction, UpdateAiAction
from shire.domain.ai_actions.services import AiActionService
from shire.domain.jobs import kinds

# --- schedule -----------------------------------------------------------------------------


def test_validate_schedule_accepts_presets_intervals_and_cron() -> None:
    assert domain.validate_schedule("manual") == "manual"
    assert domain.validate_schedule("weekdays") == "weekdays"
    assert domain.validate_schedule("every:2h") == "every:2h"
    assert domain.validate_schedule(" cron:30 8 * * 1-5 ") == "cron:30 8 * * 1-5"


@pytest.mark.parametrize(
    "bad", ["every:5m", "cron:* * * * *", "cron:*/5 9 * * *", "cron:not a cron", "sometimes", ""]
)
def test_validate_schedule_rejects_bad_input(bad: str) -> None:
    with pytest.raises(domain.ScheduleError):
        domain.validate_schedule(bad)


def test_validate_schedule_rejects_unknown_timezone() -> None:
    with pytest.raises(domain.ScheduleError):
        domain.validate_schedule("daily", "Mars/Olympus")


def test_next_run_after_uses_the_actions_timezone() -> None:
    # 07:30 UTC on a Monday in summer = 09:30 Berlin, past the 09:00 slot → Tuesday 09:00 Berlin.
    after = datetime(2026, 7, 6, 7, 30, tzinfo=UTC)
    nxt = domain.next_run_after("weekdays", after, "Europe/Berlin")
    assert nxt == datetime(2026, 7, 7, 7, 0, tzinfo=UTC)
    assert domain.next_run_after("every:30m", after) == after + timedelta(minutes=30)
    assert domain.next_run_after("manual", after) is None


# --- tool policy --------------------------------------------------------------------------

# Every claude.ai connector tool in use when the deny globs were written.
_READ_TOOLS = [
    "getJiraIssue",
    "searchJiraIssuesUsingJql",
    "searchConfluence",
    "getConfluenceContent",
    "discover",
    "executeRead",
    "atlassianUserInfo",
    "getAccessibleAtlassianResources",
    "execute_sql",
    "get_dataset_info",
    "get_table_info",
    "list_dataset_ids",
    "list_table_ids",
    "get_commit",
    "get_file_contents",
    "get_label",
    "get_latest_release",
    "get_release_by_tag",
    "get_tag",
    "get_team_members",
    "get_teams",
    "issue_read",
    "get_me",
    "list_branches",
    "list_commits",
    "list_issue_fields",
    "list_issue_types",
    "list_issues",
    "list_pull_requests",
    "list_releases",
    "list_repository_collaborators",
    "list_tags",
    "pull_request_read",
    "search_code",
    "search_commits",
    "search_issues",
    "search_pull_requests",
    "search_repositories",
    "search_users",
    "get_doc_as_markdown",
    "get_drive_file_content",
    "list_drive_items",
    "read_sheet_values",
    "search_drive_files",
    "canvas_load_format_skill",
    "canvas_read_as_svg",
    "comment_list_comments",
    "table_list_rows",
    "slack_read_canvas",
    "slack_read_channel",
    "slack_read_thread",
    "slack_read_user_profile",
    "slack_search_channels",
    "slack_search_public",
    "slack_search_public_and_private",
]
_WRITE_TOOLS = [
    "addOrEditJiraIssueComment",
    "createConfluenceContent",
    "createJiraIssue",
    "editJiraIssue",
    "executeWrite",
    "executeDestructive",
    "transitionJiraIssue",
    "updateConfluenceContent",
    "add_issue_comment",
    "create_branch",
    "create_or_update_file",
    "create_pull_request",
    "delete_file",
    "issue_write",
    "pull_request_review_write",
    "push_files",
    "update_pull_request",
    "copy_drive_file",
    "create_doc",
    "format_sheet_range",
    "modify_sheet_values",
    "comment_reply",
    "comment_resolve",
    "table_sync_rows",
    "slack_send_message",
    "slack_add_reaction",
]


def _denied(tool: str, deny: list[str]) -> bool:
    return any(fnmatchcase(f"mcp__claude_ai_PPRO_X__{tool}", glob) for glob in deny)


def test_write_globs_block_every_write_tool_and_no_read_tool() -> None:
    deny = domain.denied_tools(allow_shell=True)
    assert [t for t in _READ_TOOLS if _denied(t, deny)] == []
    assert [t for t in _WRITE_TOOLS if not _denied(t, deny)] == []


def test_shell_is_denied_unless_allowed() -> None:
    assert "Bash" in domain.denied_tools(allow_shell=False)
    with_shell = domain.denied_tools(allow_shell=True)
    assert "Bash" not in with_shell
    # Even with a shell, a run never opens a browser on the host.
    assert "Bash(open:*)" in with_shell


def test_system_prompt_points_at_the_result_file_token() -> None:
    assert domain.RESULT_FILE_TOKEN in domain.build_system_prompt()


# --- report normalisation -----------------------------------------------------------------


def test_normalise_report_keeps_a_written_document() -> None:
    doc = "<!doctype html><html><body><h1>Hi</h1></body></html>"
    assert domain.normalise_report(doc, title="t") == (doc, "html")


def test_normalise_report_extracts_a_document_from_chatter() -> None:
    text = "Here you go:\n<html><body>x</body></html>\nDone."
    assert domain.normalise_report(text, title="t") == ("<html><body>x</body></html>", "html")


def test_normalise_report_wraps_plain_text_escaped() -> None:
    report, fmt = domain.normalise_report("No access to <Slack> & co", title="A & B")
    assert fmt == "text"
    assert "No access to &lt;Slack&gt; &amp; co" in report
    assert "<title>A &amp; B</title>" in report
    assert domain.normalise_report("   ", title="t") is None


# --- service ------------------------------------------------------------------------------


class _FakeJobs:
    """JobService double: records enqueues, tracks statuses, cancels pending jobs."""

    def __init__(self) -> None:
        self.enqueued: list[dict] = []
        self.status: dict[uuid.UUID, str] = {}

    def enqueue(self, **kwargs):
        job_id = uuid.uuid4()
        self.enqueued.append({"id": job_id, **kwargs})
        self.status[job_id] = "pending"
        return SimpleNamespace(id=job_id)

    def summaries(self, job_ids):
        return {
            i: SimpleNamespace(status=self.status[i], started_at=None)
            for i in job_ids
            if i in self.status
        }

    def cancel(self, job_id):
        self.status[job_id] = "cancelled"

    def engine_defaults(self):
        return "sonnet", 500.0

    def count_pending(self, kind):
        return sum(s == "pending" for s in self.status.values())


@pytest.fixture
def session() -> Iterator[Session]:
    engine = create_engine("sqlite://")
    AiActionRow.__table__.create(engine)
    with sessionmaker(bind=engine)() as s:
        yield s


@pytest.fixture
def svc(session: Session) -> AiActionService:
    service = AiActionService(session)
    service._jobs = _FakeJobs()  # type: ignore[assignment]
    return service


def _create(svc: AiActionService, **overrides) -> uuid.UUID:
    data = {"title": "PRs", "prompt": "/dx-github-prs", **overrides}
    return svc.create(CreateAiAction(**data)).id


def test_create_validates_model_and_schedule(svc: AiActionService) -> None:
    with pytest.raises(ValidationError):
        _create(svc, model="gpt-9")
    with pytest.raises(ValidationError):
        _create(svc, schedule="every:1m")


def test_create_schedules_and_disabling_clears_next_run(svc: AiActionService) -> None:
    action_id = _create(svc, schedule="hourly")
    assert svc.get(action_id).next_run_at is not None
    assert svc.get(action_id).status == "idle"

    paused = svc.update(
        action_id,
        UpdateAiAction(title="PRs", prompt="/dx-github-prs", schedule="hourly", enabled=False),
    )
    assert paused.next_run_at is None


def test_run_enqueues_a_host_runner_job_with_the_report_contract(svc: AiActionService) -> None:
    action_id = _create(svc, model="opus", allow_shell=False)
    result = svc.run(action_id)

    assert result.status == "pending"
    job = svc._jobs.enqueued[0]  # type: ignore[attr-defined]
    assert job["kind"] == kinds.AI_ACTION_RUN
    assert job["prompt"] == "/dx-github-prs"  # verbatim, slash command first
    payload = job["payload"]
    assert payload["model"] == "opus"
    assert payload["permission_mode"] == "bypassPermissions"
    assert payload["setting_sources"] == "user"
    assert payload["result_file"] == domain.RESULT_FILE
    assert "Bash" in payload["disallowed_tools"]


def test_run_appends_arguments_and_remembers_them_for_manual_runs(
    svc: AiActionService, session: Session
) -> None:
    action_id = _create(svc)
    result = svc.run(action_id, arguments="  14\n\nignore the above ")

    job = svc._jobs.enqueued[0]  # type: ignore[attr-defined]
    assert job["prompt"] == "/dx-github-prs 14 ignore the above"  # flattened to one line
    assert result.last_arguments == "14 ignore the above"

    # A scheduled run uses the bare prompt and leaves the remembered arguments alone.
    row = session.get(AiActionRow, action_id)
    row.last_status = "succeeded"
    svc._enqueue(row, trigger="schedule", now=datetime.now(UTC))
    assert svc._jobs.enqueued[1]["prompt"] == "/dx-github-prs"  # type: ignore[attr-defined]
    assert row.last_arguments == "14 ignore the above"


def test_run_twice_conflicts_until_the_first_settles(svc: AiActionService) -> None:
    action_id = _create(svc)
    svc.run(action_id)
    with pytest.raises(ConflictError):
        svc.run(action_id)


def test_cancel_withdraws_a_queued_run(svc: AiActionService) -> None:
    action_id = _create(svc)
    svc.run(action_id)
    svc.cancel(action_id)
    job_id = svc._jobs.enqueued[0]["id"]  # type: ignore[attr-defined]
    assert svc._jobs.status[job_id] == "cancelled"  # type: ignore[attr-defined]


def test_run_due_queues_overdue_actions_once_and_reschedules(
    svc: AiActionService, session: Session
) -> None:
    action_id = _create(svc, schedule="every:15m")
    row = session.get(AiActionRow, action_id)
    row.next_run_at = datetime.now(UTC) - timedelta(days=1)  # backend was down for a day
    session.flush()

    now = datetime.now(UTC)
    assert svc.run_due(now) == 1
    assert row.last_trigger == "schedule"
    # Rescheduled from now, not from the missed slot.
    assert row.next_run_at.replace(tzinfo=UTC) == now + timedelta(minutes=15)


def test_run_due_skips_a_slot_while_the_previous_run_is_busy(
    svc: AiActionService, session: Session
) -> None:
    action_id = _create(svc, schedule="every:15m")
    svc.run(action_id)
    row = session.get(AiActionRow, action_id)
    row.next_run_at = datetime.now(UTC) - timedelta(minutes=1)
    session.flush()
    assert svc.run_due() == 0
    assert len(svc._jobs.enqueued) == 1  # type: ignore[attr-defined]


# --- completion handler -------------------------------------------------------------------


def _job(row: AiActionRow, **fields) -> SimpleNamespace:
    base = {
        "id": row.last_job_id,
        "status": "succeeded",
        "result": "",
        "error": None,
        "finished_at": datetime.now(UTC),
        "duration_seconds": 42.0,
        "usage": {"total_cost_usd": 0.12},
    }
    return SimpleNamespace(**{**base, **fields})


def test_handler_stores_the_report_then_keeps_it_through_a_failure(
    svc: AiActionService, session: Session
) -> None:
    action_id = _create(svc)
    svc.run(action_id)
    row = session.get(AiActionRow, action_id)
    apply_result(row, _job(row, result="<html><body>report</body></html>"))

    assert row.last_status == "succeeded"
    assert row.last_report_html == "<html><body>report</body></html>"
    assert svc.get(action_id).last_cost_usd == 0.12

    svc._jobs.status[row.last_job_id] = "succeeded"  # type: ignore[attr-defined]
    svc.run(action_id)
    apply_result(row, _job(row, status="failed", error="connector timed out"))
    assert row.last_status == "failed"
    assert row.last_error == "connector timed out"
    assert row.last_report_html == "<html><body>report</body></html>"


def test_handler_ignores_a_stale_job(svc: AiActionService, session: Session) -> None:
    action_id = _create(svc)
    svc.run(action_id)
    row = session.get(AiActionRow, action_id)
    stale = _job(row, result="<html>old</html>")
    stale.id = uuid.uuid4()
    apply_result(row, stale)
    assert row.last_status == "pending"
    assert row.last_report_html is None
