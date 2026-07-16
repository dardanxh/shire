"""SQLAlchemy ORM entity for the Connection aggregate.

`secret_encrypted` holds Fernet ciphertext only — the plaintext token/password never lands in
a column. Encryption/decryption happens at the repository boundary (`repositories.py`).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from shire.core.db import Base


class ConnectionRow(Base):
    __tablename__ = "connections"
    __table_args__ = (UniqueConstraint("name", name="uq_connection_name"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    provider: Mapped[str] = mapped_column(String(32))
    auth_method: Mapped[str] = mapped_column(String(16))
    username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    secret_encrypted: Mapped[str] = mapped_column(String)
    base_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
