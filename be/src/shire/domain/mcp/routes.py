"""FastAPI routes for the MCP domain. HTTP concerns only — logic lives in the service."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.domain.mcp.schemas import McpServersResult
from shire.domain.mcp.services import McpService

router = APIRouter(prefix="/mcp", tags=["mcp"])


@router.get("/servers", response_model=McpServersResult)
def list_servers(session: Session = Depends(get_session)) -> McpServersResult:
    """The MCP servers the host runner's Claude CLI sees, from the latest probe."""
    return McpService(session).servers()


@router.post("/refresh", response_model=McpServersResult)
def refresh_servers(session: Session = Depends(get_session)) -> McpServersResult:
    """Queue a probe (deduplicated) — the snapshot updates when the host runner finishes it."""
    return McpService(session).refresh()
