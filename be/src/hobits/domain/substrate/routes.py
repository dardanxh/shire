"""FastAPI routes for the Substrate domain (analysis snapshots + cross-repo queries + tools)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from hobits.core.db import get_session
from hobits.domain.substrate.schemas import (
    AnalysisResult,
    DependencyUsageResult,
    GraphResult,
    ToolStatusResult,
)
from hobits.domain.substrate.services import AnalysisService

router = APIRouter(tags=["substrate"])


@router.get("/repositories/{repository_id}/analysis", response_model=AnalysisResult)
def latest_analysis(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> AnalysisResult:
    return AnalysisService(session).latest_result(repository_id)


@router.get("/dependencies/{name}/repositories", response_model=list[DependencyUsageResult])
def repositories_using_dependency(
    name: str, session: Session = Depends(get_session)
) -> list[DependencyUsageResult]:
    return AnalysisService(session).dependency_usage(name)


@router.get("/tools", response_model=list[ToolStatusResult])
def external_tools(session: Session = Depends(get_session)) -> list[ToolStatusResult]:
    """Availability + versions of the external analysis tools (drives docs + setup)."""
    return AnalysisService(session).tool_statuses()


@router.post("/repositories/{repository_id}/tools/{tool}/run", response_model=AnalysisResult)
def run_tool_on_demand(
    repository_id: uuid.UUID, tool: str, session: Session = Depends(get_session)
) -> AnalysisResult:
    """Run a single external tool against the current clone and merge it into the analysis."""
    return AnalysisService(session).run_tool(repository_id, tool)


@router.get("/repositories/{repository_id}/graph", response_model=GraphResult)
def codebase_graph(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> GraphResult:
    """Whether a codebase graph exists for this repository and the URL to view it."""
    return AnalysisService(session).graph_status(repository_id)


@router.post("/repositories/{repository_id}/graph/run", response_model=GraphResult)
def generate_codebase_graph(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> GraphResult:
    """(Re)generate the interactive codebase graph (emerge) for the current clone."""
    return AnalysisService(session).generate_graph(repository_id)
