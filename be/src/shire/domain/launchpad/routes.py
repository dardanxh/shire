"""FastAPI routes for the Launchpad. HTTP concerns only — logic lives in the service."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.core.pagination import Page, PaginationParams
from shire.domain.launchpad.schemas import (
    ActionRunResult,
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
from shire.domain.launchpad.services import LaunchpadService

router = APIRouter(prefix="/launchpad", tags=["launchpad"])

# Logos are user/site-supplied (SVG included) and served same-origin: forbid any active content
# should one ever be opened directly rather than through an <img>.
_LOGO_HEADERS = {
    "Cache-Control": "private, max-age=31536000, immutable",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    "X-Content-Type-Options": "nosniff",
}


# --- categories ---------------------------------------------------------------------------


@router.get("/categories", response_model=list[LaunchpadCategoryResult])
def list_categories(session: Session = Depends(get_session)) -> list[LaunchpadCategoryResult]:
    return LaunchpadService(session).list_categories()


@router.post(
    "/categories", response_model=LaunchpadCategoryResult, status_code=status.HTTP_201_CREATED
)
def create_category(
    body: CreateLaunchpadCategory, session: Session = Depends(get_session)
) -> LaunchpadCategoryResult:
    return LaunchpadService(session).create_category(body)


@router.patch("/categories/{category_id}", response_model=LaunchpadCategoryResult)
def update_category(
    category_id: uuid.UUID,
    body: UpdateLaunchpadCategory,
    session: Session = Depends(get_session),
) -> LaunchpadCategoryResult:
    return LaunchpadService(session).update_category(category_id, body)


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: uuid.UUID, session: Session = Depends(get_session)) -> None:
    LaunchpadService(session).delete_category(category_id)


# --- notifications (before /bookmarks/{id} only for readability; paths don't collide) ------


@router.get("/notifications", response_model=LaunchpadNotificationsResult)
def list_notifications(
    unread: bool = Query(True, description="Only unread notifications"),
    session: Session = Depends(get_session),
) -> LaunchpadNotificationsResult:
    """Action runs that need the user (newest first), plus the unread total for the bell."""
    return LaunchpadService(session).notifications(unread_only=unread)


@router.post("/notifications/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(session: Session = Depends(get_session)) -> None:
    LaunchpadService(session).mark_all_read()


@router.post("/runs/{run_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_run_read(run_id: uuid.UUID, session: Session = Depends(get_session)) -> None:
    LaunchpadService(session).mark_run_read(run_id)


# --- bookmarks ----------------------------------------------------------------------------


@router.get("/bookmarks", response_model=list[BookmarkResult])
def list_bookmarks(
    q: str | None = Query(None, max_length=200),
    category_id: uuid.UUID | None = None,
    starred: bool | None = None,
    session: Session = Depends(get_session),
) -> list[BookmarkResult]:
    """All matching bookmarks — starred first, then most-used (decayed), then name."""
    return LaunchpadService(session).list_bookmarks(q=q, category_id=category_id, starred=starred)


@router.post("/bookmarks", response_model=BookmarkResult, status_code=status.HTTP_201_CREATED)
def create_bookmark(
    body: CreateBookmark, session: Session = Depends(get_session)
) -> BookmarkResult:
    return LaunchpadService(session).create_bookmark(body)


@router.get("/bookmarks/{bookmark_id}", response_model=BookmarkResult)
def get_bookmark(bookmark_id: uuid.UUID, session: Session = Depends(get_session)) -> BookmarkResult:
    return LaunchpadService(session).get_bookmark(bookmark_id)


@router.patch("/bookmarks/{bookmark_id}", response_model=BookmarkResult)
def update_bookmark(
    bookmark_id: uuid.UUID, body: UpdateBookmark, session: Session = Depends(get_session)
) -> BookmarkResult:
    return LaunchpadService(session).update_bookmark(bookmark_id, body)


@router.delete("/bookmarks/{bookmark_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bookmark(bookmark_id: uuid.UUID, session: Session = Depends(get_session)) -> None:
    LaunchpadService(session).delete_bookmark(bookmark_id)


@router.post("/bookmarks/{bookmark_id}/visit", response_model=BookmarkResult)
def record_visit(
    bookmark_id: uuid.UUID, session: Session = Depends(get_session)
) -> BookmarkResult:
    """Count a "Visit page" click — feeds the most-used ordering."""
    return LaunchpadService(session).record_visit(bookmark_id)


@router.get(
    "/bookmarks/{bookmark_id}/logo",
    response_class=Response,
    responses={200: {"content": {"image/*": {}}}},
)
def get_logo(bookmark_id: uuid.UUID, session: Session = Depends(get_session)) -> Response:
    body, mime = LaunchpadService(session).logo(bookmark_id)
    return Response(content=body, media_type=mime, headers=_LOGO_HEADERS)


@router.put("/bookmarks/{bookmark_id}/logo", response_model=BookmarkResult)
def upload_logo(
    bookmark_id: uuid.UUID, body: UploadBookmarkLogo, session: Session = Depends(get_session)
) -> BookmarkResult:
    return LaunchpadService(session).upload_logo(bookmark_id, body)


@router.post("/bookmarks/{bookmark_id}/logo/refresh", response_model=BookmarkResult)
def refresh_logo(
    bookmark_id: uuid.UUID, session: Session = Depends(get_session)
) -> BookmarkResult:
    """Re-fetch the site's icon."""
    return LaunchpadService(session).refresh_logo(bookmark_id)


# --- the bookmark's action ----------------------------------------------------------------


@router.get("/bookmarks/{bookmark_id}/action", response_model=BookmarkActionResult)
def get_action(
    bookmark_id: uuid.UUID, session: Session = Depends(get_session)
) -> BookmarkActionResult:
    return LaunchpadService(session).get_action(bookmark_id)


@router.put("/bookmarks/{bookmark_id}/action", response_model=BookmarkActionResult)
def upsert_action(
    bookmark_id: uuid.UUID, body: UpsertBookmarkAction, session: Session = Depends(get_session)
) -> BookmarkActionResult:
    return LaunchpadService(session).upsert_action(bookmark_id, body)


@router.delete("/bookmarks/{bookmark_id}/action", status_code=status.HTTP_204_NO_CONTENT)
def delete_action(bookmark_id: uuid.UUID, session: Session = Depends(get_session)) -> None:
    LaunchpadService(session).delete_action(bookmark_id)


@router.post(
    "/bookmarks/{bookmark_id}/action/run",
    response_model=ActionRunResult,
    status_code=status.HTTP_202_ACCEPTED,
)
def run_action(bookmark_id: uuid.UUID, session: Session = Depends(get_session)) -> ActionRunResult:
    """Run the action now (queued for the host runner)."""
    return LaunchpadService(session).run_action_now(bookmark_id)


@router.get("/bookmarks/{bookmark_id}/runs", response_model=Page[ActionRunResult])
def list_runs(
    bookmark_id: uuid.UUID,
    params: PaginationParams = Depends(),
    session: Session = Depends(get_session),
) -> Page[ActionRunResult]:
    return LaunchpadService(session).list_runs(bookmark_id, params)


@router.post("/bookmarks/{bookmark_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_bookmark_read(bookmark_id: uuid.UUID, session: Session = Depends(get_session)) -> None:
    """Mark every notification from this bookmark's action read."""
    LaunchpadService(session).mark_bookmark_read(bookmark_id)
