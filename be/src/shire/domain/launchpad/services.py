"""Launchpad service: category/bookmark CRUD, usage ranking, logos, actions and their runs.

An action run enqueues one `launchpad.action` job, which only the host runner claims (it needs the
operator's claude.ai MCP connectors). The job's completion handler (jobs.py) settles the run and
decides whether it is a notification. Scheduling is the ticker's job (ticker.py); this service
only computes `next_run_at`.
"""

from __future__ import annotations

import base64
import binascii
import logging
import uuid
from datetime import UTC, datetime
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from shire.core.exceptions import ConflictError, NotFoundError, ValidationError
from shire.core.pagination import Page, PaginationParams
from shire.domain.jobs import kinds as job_kinds
from shire.domain.jobs.services import JobService
from shire.domain.launchpad.domain import (
    ACTION_DENY_BUILTINS,
    CadenceError,
    frecency_after_visit,
    frecency_now,
    next_run_after,
    tool_permissions,
    validate_cadence,
)
from shire.domain.launchpad.jobs import build_system_prompt
from shire.domain.launchpad.models import (
    ActionRunRow,
    BookmarkActionRow,
    BookmarkRow,
    LaunchpadCategoryRow,
)
from shire.domain.launchpad.repositories import (
    SqlActionRunRepository,
    SqlBookmarkActionRepository,
    SqlBookmarkRepository,
    SqlLaunchpadCategoryRepository,
)
from shire.domain.launchpad.schemas import (
    ActionRunResult,
    ActionSummaryResult,
    BookmarkActionResult,
    BookmarkResult,
    CreateBookmark,
    CreateLaunchpadCategory,
    LaunchpadCategoryResult,
    LaunchpadNotificationsResult,
    UpdateBookmark,
    UpdateLaunchpadCategory,
    UploadBookmarkLogo,
    UpsertBookmarkAction,
)
from shire.domain.mcp.services import McpService
from shire.integrations.favicon import MAX_LOGO_BYTES, fetch_favicon

logger = logging.getLogger(__name__)

_MONOGRAM_COLORS = (
    "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0d9488",
    "#0891b2", "#4f46e5",
)
_NOTIFICATION_LIMIT = 50


def _now() -> datetime:
    return datetime.now(UTC)


def _host(url: str) -> str:
    return urlparse(url).netloc.removeprefix("www.")


def _normalize_url(url: str) -> str:
    url = url.strip()
    if "://" not in url:
        url = f"https://{url}"
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValidationError("Bookmark URL must be an http(s) address.")
    return url


def _default_color(name: str) -> str:
    return _MONOGRAM_COLORS[sum(map(ord, name)) % len(_MONOGRAM_COLORS)]


class LaunchpadService:
    """Constructed per request (or per handler/ticker unit of work) from a DB session."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._categories = SqlLaunchpadCategoryRepository(session)
        self._bookmarks = SqlBookmarkRepository(session)
        self._actions = SqlBookmarkActionRepository(session)
        self._runs = SqlActionRunRepository(session)

    # --- categories -------------------------------------------------------------------
    def list_categories(self) -> list[LaunchpadCategoryResult]:
        counts = self._categories.bookmark_counts()
        return [
            LaunchpadCategoryResult.of(row, counts.get(row.id, 0))
            for row in self._categories.list()
        ]

    def create_category(self, data: CreateLaunchpadCategory) -> LaunchpadCategoryResult:
        name = data.name.strip()
        if self._categories.get_by_name(name) is not None:
            raise ConflictError(f"A category named {name!r} already exists.")
        position = data.position
        if position is None:
            position = self._categories.next_position()
        row = LaunchpadCategoryRow(
            name=name,
            icon=data.icon,
            position=position,
            created_at=_now(),
        )
        self._categories.add(row)
        return LaunchpadCategoryResult.of(row)

    def update_category(
        self, category_id: uuid.UUID, data: UpdateLaunchpadCategory
    ) -> LaunchpadCategoryResult:
        row = self._require_category(category_id)
        if data.name is not None:
            name = data.name.strip()
            clash = self._categories.get_by_name(name)
            if clash is not None and clash.id != row.id:
                raise ConflictError(f"A category named {name!r} already exists.")
            row.name = name
        if "icon" in data.model_fields_set:
            row.icon = data.icon
        if data.position is not None:
            row.position = data.position
        self._session.flush()
        return LaunchpadCategoryResult.of(row, self._categories.bookmark_counts().get(row.id, 0))

    def delete_category(self, category_id: uuid.UUID) -> None:
        """Bookmarks in it become uncategorized (FK SET NULL), never deleted."""
        self._categories.delete(self._require_category(category_id))

    # --- bookmarks --------------------------------------------------------------------
    def list_bookmarks(
        self,
        *,
        q: str | None = None,
        category_id: uuid.UUID | None = None,
        starred: bool | None = None,
    ) -> list[BookmarkResult]:
        now = _now()
        rows = self._bookmarks.list(now=now, q=q, category_id=category_id, starred=starred)
        return self._results(rows, now)

    def get_bookmark(self, bookmark_id: uuid.UUID) -> BookmarkResult:
        return self._result(self._require_bookmark(bookmark_id))

    def create_bookmark(self, data: CreateBookmark) -> BookmarkResult:
        if data.category_id is not None:
            self._require_category(data.category_id)
        now = _now()
        row = BookmarkRow(
            name=data.name.strip(),
            url=_normalize_url(data.url),
            description=(data.description or "").strip() or None,
            category_id=data.category_id,
            starred=data.starred,
            logo_kind="monogram",
            logo_color=data.logo_color or _default_color(data.name),
            created_at=now,
            updated_at=now,
        )
        if data.logo_kind == "favicon":
            self._apply_favicon(row)
        self._bookmarks.add(row)
        return self._result(row)

    def update_bookmark(self, bookmark_id: uuid.UUID, data: UpdateBookmark) -> BookmarkResult:
        row = self._require_bookmark(bookmark_id)
        url_changed = False
        if data.name is not None:
            row.name = data.name.strip()
        if data.url is not None:
            url = _normalize_url(data.url)
            url_changed = url != row.url
            row.url = url
        if "description" in data.model_fields_set:
            row.description = (data.description or "").strip() or None
        if data.clear_category:
            row.category_id = None
        elif data.category_id is not None:
            self._require_category(data.category_id)
            row.category_id = data.category_id
        if data.starred is not None:
            row.starred = data.starred
        if data.logo_color is not None:
            row.logo_color = data.logo_color
        if data.logo_kind == "monogram":
            row.logo_kind = "monogram"
        elif data.logo_kind == "favicon" and (row.logo_kind != "favicon" or url_changed):
            self._apply_favicon(row)
        elif data.logo_kind == "upload" and row.logo_kind != "upload":
            raise ValidationError("Upload a logo image to use an uploaded logo.")
        row.updated_at = _now()
        self._session.flush()
        return self._result(row)

    def delete_bookmark(self, bookmark_id: uuid.UUID) -> None:
        self._bookmarks.delete(self._require_bookmark(bookmark_id))

    def record_visit(self, bookmark_id: uuid.UUID) -> BookmarkResult:
        row = self._require_bookmark(bookmark_id)
        now = _now()
        row.frecency = frecency_after_visit(row.frecency, row.last_visited_at, now)
        row.last_visited_at = now
        row.visit_count += 1
        self._session.flush()
        return self._result(row)

    # --- logos ------------------------------------------------------------------------
    def logo(self, bookmark_id: uuid.UUID) -> tuple[bytes, str]:
        row = self._bookmarks.get(bookmark_id, with_logo=True)
        if row is None or row.logo_bytes is None or row.logo_kind == "monogram":
            raise NotFoundError("This bookmark has no logo image.")
        return row.logo_bytes, row.logo_mime or "application/octet-stream"

    def upload_logo(self, bookmark_id: uuid.UUID, data: UploadBookmarkLogo) -> BookmarkResult:
        row = self._require_bookmark(bookmark_id)
        header, _, encoded = data.data_url.partition(",")
        if not header.startswith("data:image/") or ";base64" not in header:
            raise ValidationError("Logo must be a base64 image data URL.")
        try:
            image = base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValidationError("Logo data is not valid base64.") from exc
        if len(image) > MAX_LOGO_BYTES:
            raise ValidationError(f"Logo must be at most {MAX_LOGO_BYTES // 1024} KB.")
        row.logo_bytes = image
        row.logo_mime = header.removeprefix("data:").split(";")[0]
        row.logo_kind = "upload"
        row.updated_at = _now()
        self._session.flush()
        return self._result(row)

    def refresh_logo(self, bookmark_id: uuid.UUID) -> BookmarkResult:
        row = self._require_bookmark(bookmark_id)
        if not self._apply_favicon(row):
            raise ValidationError(
                "Couldn't fetch an icon from the site (it may need a login). "
                "Upload one instead, or keep the monogram."
            )
        row.updated_at = _now()
        self._session.flush()
        return self._result(row)

    def _apply_favicon(self, row: BookmarkRow) -> bool:
        icon = fetch_favicon(row.url)
        if icon is None:
            row.logo_kind = "monogram"
            return False
        row.logo_bytes, row.logo_mime = icon
        row.logo_kind = "favicon"
        return True

    # --- actions ----------------------------------------------------------------------
    def get_action(self, bookmark_id: uuid.UUID) -> BookmarkActionResult:
        self._require_bookmark(bookmark_id)
        action = self._actions.for_bookmark(bookmark_id)
        if action is None:
            raise NotFoundError("This bookmark has no action yet.")
        return self._action_result(action)

    def upsert_action(
        self, bookmark_id: uuid.UUID, data: UpsertBookmarkAction
    ) -> BookmarkActionResult:
        self._require_bookmark(bookmark_id)
        try:
            cadence = validate_cadence(data.cadence, data.timezone)
        except CadenceError as exc:
            raise ValidationError(str(exc)) from exc
        if data.model is not None and data.model not in job_kinds.AVAILABLE_MODELS:
            raise ValidationError(f"Unknown model {data.model!r}.")
        servers = list(dict.fromkeys(s.strip() for s in data.mcp_servers if s.strip()))
        now = _now()
        action = self._actions.for_bookmark(bookmark_id)
        is_new = action is None
        if action is None:
            action = BookmarkActionRow(
                bookmark_id=bookmark_id, seen_keys=[], cadence="manual", timezone="UTC",
                created_at=now,
            )
        elif action.prompt != data.prompt or list(action.mcp_servers or []) != servers:
            # A different question makes old "already reported" keys meaningless.
            action.seen_keys = []
        action.prompt = data.prompt
        action.mcp_servers = servers
        action.allow_writes = data.allow_writes
        action.model = data.model
        action.timeout_seconds = data.timeout_seconds
        schedule_changed = (action.cadence, action.timezone) != (cadence, data.timezone)
        action.cadence = cadence
        action.timezone = data.timezone
        action.enabled = data.enabled
        action.notify_on = data.notify_on
        action.updated_at = now
        if not data.enabled or cadence == "manual":
            action.next_run_at = None
        elif schedule_changed or action.next_run_at is None:
            action.next_run_at = next_run_after(cadence, now, data.timezone)
        if is_new:
            self._actions.add(action)
        self._session.flush()
        return self._action_result(action)

    def delete_action(self, bookmark_id: uuid.UUID) -> None:
        self._require_bookmark(bookmark_id)
        action = self._actions.for_bookmark(bookmark_id)
        if action is None:
            raise NotFoundError("This bookmark has no action.")
        self._actions.delete(action)

    def run_action_now(self, bookmark_id: uuid.UUID) -> ActionRunResult:
        self._require_bookmark(bookmark_id)
        action = self._actions.for_bookmark(bookmark_id)
        if action is None:
            raise NotFoundError("This bookmark has no action.")
        if self._runs.has_pending(action.id):
            raise ConflictError("This action is already running.")
        run = self.start_run(action, trigger="manual")
        bookmark = self._require_bookmark(bookmark_id)
        return ActionRunResult.of(run, bookmark_id=bookmark.id, bookmark_name=bookmark.name)

    def start_run(self, action: BookmarkActionRow, *, trigger: str) -> ActionRunRow:
        """Enqueue one run of `action` (used by run-now and the ticker)."""
        bookmark = self._require_bookmark(action.bookmark_id)
        mcp = McpService(self._session)
        if action.mcp_servers and not action.allow_writes and not mcp.has_probe_data():
            # Without a probe we can't name the write tools to deny — refuse rather than run
            # an action with writes silently enabled.
            raise ConflictError(
                "MCP servers haven't been probed yet, so write tools can't be blocked. "
                "Refresh the MCP servers on Home (needs the host runner), then try again."
            )
        allowed, denied = tool_permissions(
            list(action.mcp_servers or []), mcp.tools_by_server(), allow_writes=action.allow_writes
        )
        jobs = JobService(self._session)
        default_model, _ = jobs.engine_defaults()
        now = _now()
        run = ActionRunRow(action_id=action.id, trigger=trigger, status="pending", created_at=now)
        self._runs.add(run)
        job = jobs.enqueue(
            kind=job_kinds.LAUNCHPAD_ACTION,
            title=f"Launchpad: {bookmark.name}",
            prompt=action.prompt,
            payload={
                "system": build_system_prompt(
                    name=bookmark.name,
                    url=bookmark.url,
                    description=bookmark.description,
                    allow_writes=action.allow_writes,
                ),
                # Always non-empty: an empty allowlist would read as "unrestricted".
                "allowed_tools": allowed or ["ToolSearch"],
                "disallowed_tools": [*ACTION_DENY_BUILTINS, *denied],
                "model": action.model or default_model,
                "timeout_seconds": action.timeout_seconds,
                "run_id": str(run.id),
                "bookmark_id": str(bookmark.id),
            },
        )
        run.job_id = job.id
        self._session.flush()
        return run

    def list_runs(
        self, bookmark_id: uuid.UUID, params: PaginationParams
    ) -> Page[ActionRunResult]:
        bookmark = self._require_bookmark(bookmark_id)
        action = self._actions.for_bookmark(bookmark_id)
        if action is None:
            return Page[ActionRunResult].create([], 0, params)
        rows, total = self._runs.list_for_action(
            action.id, limit=params.limit, offset=params.offset
        )
        items = [
            ActionRunResult.of(r, bookmark_id=bookmark.id, bookmark_name=bookmark.name)
            for r in rows
        ]
        return Page[ActionRunResult].create(items, total, params)

    # --- notifications ----------------------------------------------------------------
    def notifications(self, *, unread_only: bool) -> LaunchpadNotificationsResult:
        rows = self._runs.notifications(unread_only=unread_only, limit=_NOTIFICATION_LIMIT)
        return LaunchpadNotificationsResult(
            unread_count=self._runs.unread_total(),
            items=[
                ActionRunResult.of(run, bookmark_id=bid, bookmark_name=name)
                for run, bid, name in rows
            ],
        )

    def mark_run_read(self, run_id: uuid.UUID) -> None:
        if self._runs.get(run_id) is None:
            raise NotFoundError("Run not found.")
        self._runs.mark_read(_now(), run_id=run_id)

    def mark_bookmark_read(self, bookmark_id: uuid.UUID) -> None:
        self._require_bookmark(bookmark_id)
        action = self._actions.for_bookmark(bookmark_id)
        if action is not None:
            self._runs.mark_read_for_action(action.id, _now())

    def mark_all_read(self) -> None:
        self._runs.mark_read(_now())

    def unread_count(self) -> int:
        return self._runs.unread_total()

    # --- scheduling (ticker) ----------------------------------------------------------
    def run_due_actions(self) -> int:
        """Start every due action once and advance its schedule. Returns runs started."""
        now = _now()
        started = 0
        for action in self._actions.claim_due(now):
            action.next_run_at = next_run_after(action.cadence, now, action.timezone)
            if self._runs.has_pending(action.id):
                continue  # still running from last time — skip this slot, never overlap
            try:
                with self._session.begin_nested():
                    self.start_run(action, trigger="schedule")
                started += 1
            except ConflictError as exc:
                logger.info("Skipped scheduled action %s: %s", action.id, exc.detail)
        return started

    # --- helpers ----------------------------------------------------------------------
    def _require_category(self, category_id: uuid.UUID) -> LaunchpadCategoryRow:
        row = self._categories.get(category_id)
        if row is None:
            raise NotFoundError("Category not found.")
        return row

    def _require_bookmark(self, bookmark_id: uuid.UUID) -> BookmarkRow:
        row = self._bookmarks.get(bookmark_id)
        if row is None:
            raise NotFoundError("Bookmark not found.")
        return row

    def _action_result(self, action: BookmarkActionRow) -> BookmarkActionResult:
        _, denied = tool_permissions(
            list(action.mcp_servers or []),
            McpService(self._session).tools_by_server(),
            allow_writes=action.allow_writes,
        )
        return BookmarkActionResult.of(action, denied)

    def _result(self, row: BookmarkRow) -> BookmarkResult:
        return self._results([row], _now())[0]

    def _results(self, rows: list[BookmarkRow], now: datetime) -> list[BookmarkResult]:
        categories = {c.id: c.name for c in self._categories.list()}
        actions = self._actions.by_bookmarks([r.id for r in rows])
        action_ids = [a.id for a in actions.values()]
        latest = self._runs.latest_by_actions(action_ids)
        unread = self._runs.unread_counts(action_ids)
        results: list[BookmarkResult] = []
        for row in rows:
            action = actions.get(row.id)
            summary = None
            if action is not None:
                last = latest.get(action.id)
                summary = ActionSummaryResult(
                    enabled=action.enabled,
                    cadence=action.cadence,
                    next_run_at=action.next_run_at,
                    last_run_at=action.last_run_at,
                    last_outcome=last.outcome if last else None,
                    last_status=last.status if last else None,
                    unread_count=unread.get(action.id, 0),
                )
            results.append(
                BookmarkResult.of(
                    row,
                    host=_host(row.url),
                    score=frecency_now(row.frecency, row.last_visited_at, now),
                    category_name=categories.get(row.category_id) if row.category_id else None,
                    action=summary,
                    has_logo=row.logo_mime is not None,
                )
            )
        return results
