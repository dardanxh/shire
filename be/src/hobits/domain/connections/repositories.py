"""Data access for the Connection aggregate.

Encryption boundary: the domain always sees a plaintext `secret`; the database only ever holds
Fernet ciphertext. `_apply` encrypts on the way in, `_to_domain` decrypts on the way out.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from hobits.core.crypto import decrypt, encrypt
from hobits.domain.connections.domain import AuthMethod, Connection
from hobits.domain.connections.models import ConnectionRow
from hobits.domain.repository.domain import GitProvider


def _to_domain(row: ConnectionRow) -> Connection:
    return Connection(
        id=row.id,
        name=row.name,
        provider=GitProvider(row.provider),
        auth_method=AuthMethod(row.auth_method),
        secret=decrypt(row.secret_encrypted),
        username=row.username,
        base_url=row.base_url,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _apply(row: ConnectionRow, connection: Connection) -> None:
    row.id = connection.id
    row.name = connection.name
    row.provider = connection.provider.value
    row.auth_method = connection.auth_method.value
    row.username = connection.username
    row.secret_encrypted = encrypt(connection.secret)
    row.base_url = connection.base_url
    row.created_at = connection.created_at
    row.updated_at = connection.updated_at


class SqlConnectionRepository:
    """Concrete `ConnectionRepository` port bound to a SQLAlchemy session."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, connection: Connection) -> None:
        row = ConnectionRow()
        _apply(row, connection)
        self._session.add(row)

    def save(self, connection: Connection) -> None:
        row = self._session.get(ConnectionRow, connection.id)
        if row is None:
            self.add(connection)
            return
        _apply(row, connection)

    def get(self, connection_id: uuid.UUID) -> Connection | None:
        row = self._session.get(ConnectionRow, connection_id)
        return _to_domain(row) if row else None

    def get_by_name(self, name: str) -> Connection | None:
        stmt = select(ConnectionRow).where(ConnectionRow.name == name)
        row = self._session.scalars(stmt).first()
        return _to_domain(row) if row else None

    def list(self, *, limit: int | None = None, offset: int = 0) -> list[Connection]:
        stmt = select(ConnectionRow).order_by(ConnectionRow.created_at.desc()).offset(offset)
        if limit is not None:
            stmt = stmt.limit(limit)
        return [_to_domain(r) for r in self._session.scalars(stmt)]

    def count(self) -> int:
        return self._session.scalar(select(func.count()).select_from(ConnectionRow)) or 0

    def delete(self, connection_id: uuid.UUID) -> None:
        row = self._session.get(ConnectionRow, connection_id)
        if row is not None:
            self._session.delete(row)
