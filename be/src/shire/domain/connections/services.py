"""Connections domain service: CRUD + live credential testing, returning `*Result` schemas.

The route layer calls this; it never touches SQLAlchemy or HTTP. Credential testing dispatches
to a provider connector (`integrations/git_providers/`) and never raises on auth failure — a bad
credential is a normal `ok=False` result, not a 500.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from shire.core.exceptions import ConflictError, NotFoundError
from shire.core.pagination import Page, PaginationParams
from shire.domain.connections.domain import Connection, ProviderCredential
from shire.domain.connections.repositories import SqlConnectionRepository
from shire.domain.connections.schemas import (
    ConnectionResult,
    CreateConnection,
    TestConnectionRequest,
    TestConnectionResult,
    UpdateConnection,
)
from shire.integrations.git_providers.registry import get_connector


class ConnectionService:
    """Business logic for connections. Constructed per request from a DB session."""

    def __init__(self, session: Session) -> None:
        self._repos = SqlConnectionRepository(session)

    # --- reads ----------------------------------------------------------------
    def list(self, params: PaginationParams) -> Page[ConnectionResult]:
        total = self._repos.count()
        connections = self._repos.list(limit=params.limit, offset=params.offset)
        items = [ConnectionResult.of(c) for c in connections]
        return Page.create(items, total, params)

    def get(self, connection_id: uuid.UUID) -> ConnectionResult:
        return ConnectionResult.of(self._require(connection_id))

    # --- writes ---------------------------------------------------------------
    def create(self, data: CreateConnection) -> ConnectionResult:
        if self._repos.get_by_name(data.name) is not None:
            raise ConflictError(f"A connection named {data.name!r} already exists.")
        connection = Connection(
            name=data.name,
            provider=data.provider,
            auth_method=data.auth_method,
            secret=data.secret or "",  # local connections carry no secret
            username=data.username,
            base_url=data.base_url,
        )
        self._repos.add(connection)
        return ConnectionResult.of(connection)

    def update(self, connection_id: uuid.UUID, data: UpdateConnection) -> ConnectionResult:
        connection = self._require(connection_id)
        if data.name != connection.name:
            clash = self._repos.get_by_name(data.name)
            if clash is not None and clash.id != connection_id:
                raise ConflictError(f"A connection named {data.name!r} already exists.")
        connection.update(
            name=data.name,
            username=data.username,
            base_url=data.base_url,
            secret=data.secret,
        )
        self._repos.save(connection)
        return ConnectionResult.of(connection)

    def delete(self, connection_id: uuid.UUID) -> None:
        self._require(connection_id)
        self._repos.delete(connection_id)

    # --- testing --------------------------------------------------------------
    def test(self, request: TestConnectionRequest) -> TestConnectionResult:
        credential = ProviderCredential(
            provider=request.provider,
            auth_method=request.auth_method,
            secret=request.secret,  # type: ignore[arg-type]  # validated non-empty by the schema
            username=request.username,
            base_url=request.base_url,
        )
        return self._run_test(credential)

    def test_existing(self, connection_id: uuid.UUID) -> TestConnectionResult:
        return self._run_test(self._require(connection_id).credential())

    # --- collaboration (used by RepositoryService) ----------------------------
    def resolve_credential(self, connection_id: uuid.UUID) -> ProviderCredential | None:
        connection = self._repos.get(connection_id)
        return connection.credential() if connection is not None else None

    # --- internals ------------------------------------------------------------
    def _run_test(self, credential: ProviderCredential) -> TestConnectionResult:
        result = get_connector(credential.provider).test(credential)
        return TestConnectionResult(ok=result.ok, message=result.message, account=result.account)

    def _require(self, connection_id: uuid.UUID) -> Connection:
        connection = self._repos.get(connection_id)
        if connection is None:
            raise NotFoundError("Connection not found")
        return connection
