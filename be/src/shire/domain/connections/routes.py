"""FastAPI routes for the Connections domain. HTTP concerns only — logic lives in the service."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.core.pagination import Page, PaginationParams
from shire.domain.connections.schemas import (
    ConnectionResult,
    CreateConnection,
    TestConnectionRequest,
    TestConnectionResult,
    UpdateConnection,
)
from shire.domain.connections.services import ConnectionService

router = APIRouter(prefix="/connections", tags=["connections"])


@router.post("", response_model=ConnectionResult, status_code=status.HTTP_201_CREATED)
def create_connection(
    body: CreateConnection, session: Session = Depends(get_session)
) -> ConnectionResult:
    """Store a named credential set for a git provider."""
    return ConnectionService(session).create(body)


@router.get("", response_model=Page[ConnectionResult])
def list_connections(
    params: PaginationParams = Depends(),
    session: Session = Depends(get_session),
) -> Page[ConnectionResult]:
    return ConnectionService(session).list(params)


@router.post("/test", response_model=TestConnectionResult)
def test_connection(
    body: TestConnectionRequest, session: Session = Depends(get_session)
) -> TestConnectionResult:
    """Validate unsaved credentials against the provider (used by the create/edit form)."""
    return ConnectionService(session).test(body)


@router.get("/{connection_id}", response_model=ConnectionResult)
def get_connection(
    connection_id: uuid.UUID, session: Session = Depends(get_session)
) -> ConnectionResult:
    return ConnectionService(session).get(connection_id)


@router.patch("/{connection_id}", response_model=ConnectionResult)
def update_connection(
    connection_id: uuid.UUID,
    body: UpdateConnection,
    session: Session = Depends(get_session),
) -> ConnectionResult:
    return ConnectionService(session).update(connection_id, body)


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_connection(
    connection_id: uuid.UUID, session: Session = Depends(get_session)
) -> None:
    ConnectionService(session).delete(connection_id)


@router.post("/{connection_id}/test", response_model=TestConnectionResult)
def test_existing_connection(
    connection_id: uuid.UUID, session: Session = Depends(get_session)
) -> TestConnectionResult:
    """Validate a stored connection's credentials against the provider."""
    return ConnectionService(session).test_existing(connection_id)
