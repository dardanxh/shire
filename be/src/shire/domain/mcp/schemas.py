"""Pydantic I/O schemas for the MCP domain."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from shire.domain.mcp.domain import is_write_tool
from shire.domain.mcp.models import McpServerRow


class McpServerResult(BaseModel):
    name: str
    target: str
    status: str
    status_detail: str | None
    tool_count: int
    write_tool_count: int
    checked_at: datetime

    @classmethod
    def of(cls, row: McpServerRow) -> McpServerResult:
        tools = row.tools or []
        return cls(
            name=row.name,
            target=row.target,
            status=row.status,
            status_detail=row.status_detail,
            tool_count=len(tools),
            write_tool_count=sum(is_write_tool(t) for t in tools),
            checked_at=row.checked_at,
        )


class McpServersResult(BaseModel):
    servers: list[McpServerResult]
    checked_at: datetime | None
    # The newest probe job (pending/running/failed tells the UI why the list may be stale).
    probe_job_id: uuid.UUID | None
    probe_status: str | None
    probe_error: str | None
    host_runner_running: bool
