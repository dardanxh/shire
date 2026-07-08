"""FastAPI routes for the tools catalog (persisted; refreshed on demand via sync)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from hobits.core.db import get_session
from hobits.domain.tools.schemas import ToolStatusResult
from hobits.domain.tools.services import ToolService

router = APIRouter(prefix="/tools", tags=["tools"])


@router.get("", response_model=list[ToolStatusResult])
def list_tools(session: Session = Depends(get_session)) -> list[ToolStatusResult]:
    """The persisted tools catalog (availability + versions). Fast read; refresh via /tools/sync."""
    return ToolService(session).list_tools()


@router.post("/sync", response_model=list[ToolStatusResult])
def sync_tools(session: Session = Depends(get_session)) -> list[ToolStatusResult]:
    """Re-probe the local environment for every tool and refresh the stored catalog."""
    return ToolService(session).sync_tools()
