"""FastAPI routes for the tools catalog (persisted; refreshed on demand via sync)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.domain.tools.schemas import ToolStatusResult
from shire.domain.tools.services import ToolService

router = APIRouter(prefix="/tools", tags=["tools"])


@router.get("", response_model=list[ToolStatusResult])
def list_tools(session: Session = Depends(get_session)) -> list[ToolStatusResult]:
    """The persisted tools catalog (availability + versions). Fast read; refresh via /tools/sync."""
    return ToolService(session).list_tools()


@router.post("/sync", response_model=list[ToolStatusResult])
def sync_tools(session: Session = Depends(get_session)) -> list[ToolStatusResult]:
    """Re-probe the local environment for every tool and refresh the stored catalog."""
    return ToolService(session).sync_tools()


@router.post(
    "/{tool_id}/install",
    response_model=ToolStatusResult,
    status_code=status.HTTP_202_ACCEPTED,
)
def install_tool(tool_id: str, session: Session = Depends(get_session)) -> ToolStatusResult:
    """Run the tool's curated install command in the background (non-blocking — poll GET /tools).
    Automated installs are best-effort; the manual command is always the fallback."""
    return ToolService(session).install_tool(tool_id)
