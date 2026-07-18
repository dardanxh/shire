"""FastAPI routes for the council domain — topics, roster, and convening the debate."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.core.pagination import Page, PaginationParams
from shire.domain.council.schemas import (
    CouncilTopicDetailResult,
    CouncilTopicResult,
    CreateCouncilTopic,
    UpdateCouncilMembers,
    UpdateCouncilTopic,
)
from shire.domain.council.services import CouncilService

router = APIRouter(prefix="/council", tags=["council"])


@router.post("", response_model=CouncilTopicDetailResult, status_code=status.HTTP_201_CREATED)
def create_topic(
    body: CreateCouncilTopic, session: Session = Depends(get_session)
) -> CouncilTopicDetailResult:
    """Create a topic. A roster-suggestion job is enqueued automatically; edit the roster,
    then convene to start the debate."""
    return CouncilService(session).create(body)


@router.get("", response_model=Page[CouncilTopicResult])
def list_topics(
    params: PaginationParams = Depends(), session: Session = Depends(get_session)
) -> Page[CouncilTopicResult]:
    return CouncilService(session).list(params)


@router.get("/{topic_id}", response_model=CouncilTopicDetailResult)
def get_topic(
    topic_id: uuid.UUID, session: Session = Depends(get_session)
) -> CouncilTopicDetailResult:
    """The topic with its full debate state (takes + synthesis) — the UI polls this."""
    return CouncilService(session).get(topic_id)


@router.put("/{topic_id}", response_model=CouncilTopicDetailResult)
def update_topic(
    topic_id: uuid.UUID,
    body: UpdateCouncilTopic,
    session: Session = Depends(get_session),
) -> CouncilTopicDetailResult:
    """Edit the topic (name, description, repos, devil's advocate). Locked mid-debate."""
    return CouncilService(session).update(topic_id, body)


@router.put("/{topic_id}/members", response_model=CouncilTopicDetailResult)
def set_topic_members(
    topic_id: uuid.UUID,
    body: UpdateCouncilMembers,
    session: Session = Depends(get_session),
) -> CouncilTopicDetailResult:
    """Replace the roster. Marks it user-edited so a late suggestion never clobbers it."""
    return CouncilService(session).set_members(topic_id, body)


@router.post(
    "/{topic_id}/convene",
    response_model=CouncilTopicDetailResult,
    status_code=status.HTTP_202_ACCEPTED,
)
def convene_topic(
    topic_id: uuid.UUID, session: Session = Depends(get_session)
) -> CouncilTopicDetailResult:
    """Start (or restart) the debate — async; poll the detail endpoint to watch the rounds."""
    return CouncilService(session).convene(topic_id)


@router.delete("/{topic_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_topic(topic_id: uuid.UUID, session: Session = Depends(get_session)) -> None:
    CouncilService(session).delete(topic_id)
