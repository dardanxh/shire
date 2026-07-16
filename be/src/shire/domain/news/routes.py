"""FastAPI routes for the news domain. HTTP concerns only — logic lives in the service."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.core.pagination import Page, PaginationParams
from shire.domain.news.schemas import (
    CreateNewsSource,
    CreateNewsTopic,
    GenerateRecommendationsResult,
    NewsConfigResult,
    NewsItemResult,
    NewsPollResult,
    NewsRecommendationResult,
    NewsSourceResult,
    NewsTopicResult,
    UpdateNewsConfig,
    UpdateNewsTopic,
)
from shire.domain.news.services import NewsService

router = APIRouter(prefix="/news", tags=["news"])


class MarkReadRequest(BaseModel):
    """Mark all items read — scoped to one topic when `topic_id` is set, else the whole feed."""

    topic_id: uuid.UUID | None = None


# --- topics & sources ---------------------------------------------------------------


@router.get("/topics", response_model=list[NewsTopicResult])
def list_topics(session: Session = Depends(get_session)) -> list[NewsTopicResult]:
    """Every topic with its sources, newest poll state and unread count."""
    return NewsService(session).list_topics()


@router.post("/topics", response_model=NewsTopicResult, status_code=status.HTTP_201_CREATED)
def create_topic(
    body: CreateNewsTopic, session: Session = Depends(get_session)
) -> NewsTopicResult:
    return NewsService(session).create_topic(body)


@router.put("/topics/{topic_id}", response_model=NewsTopicResult)
def update_topic(
    topic_id: uuid.UUID, body: UpdateNewsTopic, session: Session = Depends(get_session)
) -> NewsTopicResult:
    return NewsService(session).update_topic(topic_id, body)


@router.delete("/topics/{topic_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_topic(topic_id: uuid.UUID, session: Session = Depends(get_session)) -> None:
    NewsService(session).delete_topic(topic_id)


@router.post(
    "/topics/{topic_id}/sources",
    response_model=NewsSourceResult,
    status_code=status.HTTP_201_CREATED,
)
def add_source(
    topic_id: uuid.UUID, body: CreateNewsSource, session: Session = Depends(get_session)
) -> NewsSourceResult:
    return NewsService(session).add_source(topic_id, body)


@router.delete(
    "/topics/{topic_id}/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_source(
    topic_id: uuid.UUID, source_id: uuid.UUID, session: Session = Depends(get_session)
) -> None:
    NewsService(session).delete_source(topic_id, source_id)


# --- the feed -----------------------------------------------------------------------


@router.get("/items", response_model=Page[NewsItemResult])
def list_items(
    topic_id: uuid.UUID | None = None,
    unread_only: bool = False,
    params: PaginationParams = Depends(),
    session: Session = Depends(get_session),
) -> Page[NewsItemResult]:
    """The news feed, newest first. Optionally one topic's items, or unread only."""
    return NewsService(session).list_items(params, topic_id=topic_id, unread_only=unread_only)


@router.post("/items/{item_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_item_read(item_id: uuid.UUID, session: Session = Depends(get_session)) -> None:
    NewsService(session).mark_item_read(item_id)


@router.post("/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(body: MarkReadRequest, session: Session = Depends(get_session)) -> None:
    """Mark all items read (or all of one topic's items when `topic_id` is given)."""
    NewsService(session).mark_read(body.topic_id)


# --- polling ------------------------------------------------------------------------


@router.post(
    "/fetch", response_model=list[NewsPollResult], status_code=status.HTTP_202_ACCEPTED
)
def fetch_now(session: Session = Depends(get_session)) -> list[NewsPollResult]:
    """Poll every enabled topic now (one engine job per topic, non-blocking — poll the runs)."""
    return NewsService(session).poll_all(trigger="manual")


@router.post(
    "/topics/{topic_id}/fetch",
    response_model=NewsPollResult,
    status_code=status.HTTP_202_ACCEPTED,
)
def fetch_topic(topic_id: uuid.UUID, session: Session = Depends(get_session)) -> NewsPollResult:
    """Poll one topic now (non-blocking — poll the runs)."""
    return NewsService(session).poll_topic(topic_id, trigger="manual")


@router.get("/polls", response_model=list[NewsPollResult])
def list_polls(
    topic_id: uuid.UUID | None = None, session: Session = Depends(get_session)
) -> list[NewsPollResult]:
    """Recent poll runs, newest first — the UI's in-flight fetch poll target."""
    return NewsService(session).list_polls(topic_id=topic_id)


# --- config -------------------------------------------------------------------------


@router.get("/config", response_model=NewsConfigResult)
def get_config(session: Session = Depends(get_session)) -> NewsConfigResult:
    return NewsService(session).get_config()


@router.put("/config", response_model=NewsConfigResult)
def update_config(
    body: UpdateNewsConfig, session: Session = Depends(get_session)
) -> NewsConfigResult:
    """Save cadence + per-topic item cap, and reconcile the Prefect schedule."""
    return NewsService(session).update_config(body)


# --- recommendations ------------------------------------------------------------------


@router.get("/recommendations", response_model=list[NewsRecommendationResult])
def list_recommendations(
    status_filter: str | None = None, session: Session = Depends(get_session)
) -> list[NewsRecommendationResult]:
    return NewsService(session).list_recommendations(status=status_filter)


@router.post(
    "/recommendations/generate",
    response_model=GenerateRecommendationsResult,
    status_code=status.HTTP_202_ACCEPTED,
)
def generate_recommendations(
    session: Session = Depends(get_session),
) -> GenerateRecommendationsResult:
    """Suggest topics from the repo portfolio's context (one engine job, non-blocking)."""
    return NewsService(session).generate_recommendations()


@router.post("/recommendations/{recommendation_id}/accept", response_model=NewsTopicResult)
def accept_recommendation(
    recommendation_id: uuid.UUID, session: Session = Depends(get_session)
) -> NewsTopicResult:
    """Turn a suggestion into a followed topic."""
    return NewsService(session).accept_recommendation(recommendation_id)


@router.post(
    "/recommendations/{recommendation_id}/dismiss", status_code=status.HTTP_204_NO_CONTENT
)
def dismiss_recommendation(
    recommendation_id: uuid.UUID, session: Session = Depends(get_session)
) -> None:
    """Dismiss a suggestion — it will not be suggested again."""
    NewsService(session).dismiss_recommendation(recommendation_id)
