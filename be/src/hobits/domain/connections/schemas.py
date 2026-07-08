"""Pydantic I/O schemas for the Connections domain (Create / Update / Test / Result).

`ConnectionResult` never returns the secret — only a `secret_hint`. Input schemas validate that
the auth method has the fields it needs (token ⇒ secret; basic ⇒ username + secret) and that the
provider is one that supports credential connections.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, model_validator

from hobits.domain.connections.domain import CONNECTABLE_PROVIDERS, AuthMethod, Connection
from hobits.domain.repository.domain import GitProvider


class _CredentialFields(BaseModel):
    """Shared credential inputs + cross-field validation for create/test."""

    provider: GitProvider
    auth_method: AuthMethod
    username: str | None = None
    secret: str | None = None
    base_url: str | None = None

    @model_validator(mode="after")
    def _validate_credentials(self) -> _CredentialFields:
        if self.provider not in CONNECTABLE_PROVIDERS:
            supported = ", ".join(p.value for p in CONNECTABLE_PROVIDERS)
            raise ValueError(f"Provider must be one of: {supported}.")
        if not self.secret:
            raise ValueError("A token or password is required.")
        if self.auth_method is AuthMethod.basic and not self.username:
            raise ValueError("Username is required for basic (username + password) auth.")
        return self


class CreateConnection(_CredentialFields):
    """Create input: a named credential set."""

    name: str


class TestConnectionRequest(_CredentialFields):
    """Test unsaved credentials (from the form, before persisting)."""


class UpdateConnection(BaseModel):
    """Edit input. A blank/omitted `secret` keeps the existing one."""

    name: str
    username: str | None = None
    secret: str | None = None
    base_url: str | None = None


class ConnectionResult(BaseModel):
    """Result schema — never carries the secret, only a redacted hint."""

    id: uuid.UUID
    name: str
    provider: str
    auth_method: str
    username: str | None
    base_url: str | None
    secret_hint: str
    created_at: datetime
    updated_at: datetime

    @classmethod
    def of(cls, connection: Connection) -> ConnectionResult:
        return cls(
            id=connection.id,
            name=connection.name,
            provider=connection.provider.value,
            auth_method=connection.auth_method.value,
            username=connection.username,
            base_url=connection.base_url,
            secret_hint=connection.secret_hint,
            created_at=connection.created_at,
            updated_at=connection.updated_at,
        )


class TestConnectionResult(BaseModel):
    """Result of a live credential check. `ok=False` is a normal outcome, not an error."""

    ok: bool
    message: str
    account: str | None = None
