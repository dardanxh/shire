"""Data access for the MCP server snapshot."""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from shire.domain.mcp.models import McpServerRow


class SqlMcpServerRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list(self) -> list[McpServerRow]:
        return list(self._session.scalars(select(McpServerRow).order_by(McpServerRow.name)))

    def get(self, name: str) -> McpServerRow | None:
        return self._session.get(McpServerRow, name)

    def add(self, row: McpServerRow) -> None:
        self._session.add(row)

    def delete_except(self, names: list[str]) -> None:
        stmt = delete(McpServerRow)
        if names:
            stmt = stmt.where(McpServerRow.name.not_in(names))
        self._session.execute(stmt)
