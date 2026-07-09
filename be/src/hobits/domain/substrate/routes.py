"""FastAPI routes for the Substrate domain (analysis snapshots + cross-repo queries + tools)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from hobits.core.db import get_session
from hobits.domain.substrate.schemas import (
    AnalysisResult,
    ArchitectureResult,
    CodeAgeResult,
    CodebaseOverviewResult,
    CodeMapResult,
    CouplingResult,
    DependencyFreshnessResult,
    DependencyUsageResult,
    GraphResult,
    ToolLogResult,
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


@router.post("/repositories/{repository_id}/tools/{tool}/run", response_model=AnalysisResult)
def run_tool_on_demand(
    repository_id: uuid.UUID, tool: str, session: Session = Depends(get_session)
) -> AnalysisResult:
    """Run a single external tool against the current clone and merge it into the analysis."""
    return AnalysisService(session).run_tool(repository_id, tool)


@router.get("/repositories/{repository_id}/tools/{tool}/log", response_model=ToolLogResult)
def tool_log(
    repository_id: uuid.UUID, tool: str, session: Session = Depends(get_session)
) -> ToolLogResult:
    """Raw findings log (lint/SAST/dead-code/secret locations) for the tool's latest run."""
    return AnalysisService(session).tool_log(repository_id, tool)


@router.get("/repositories/{repository_id}/integrations", response_model=list[str])
def linked_integrations(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> list[str]:
    """Tool-ids of the integrations linked to this repository (the analysis allow-list)."""
    return AnalysisService(session).linked_integrations(repository_id)


@router.post("/repositories/{repository_id}/integrations/{tool_id}", response_model=list[str])
def link_integration(
    repository_id: uuid.UUID, tool_id: str, session: Session = Depends(get_session)
) -> list[str]:
    """Link an integration to a repository (enables it; runs on the next refresh or manual run)."""
    return AnalysisService(session).link_integration(repository_id, tool_id)


@router.delete("/repositories/{repository_id}/integrations/{tool_id}", response_model=list[str])
def unlink_integration(
    repository_id: uuid.UUID, tool_id: str, session: Session = Depends(get_session)
) -> list[str]:
    """Unlink an integration and clear its contributed data from the analysis."""
    return AnalysisService(session).unlink_integration(repository_id, tool_id)


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


@router.get("/repositories/{repository_id}/code-age", response_model=CodeAgeResult)
def code_age(repository_id: uuid.UUID, session: Session = Depends(get_session)) -> CodeAgeResult:
    """Code age / survival over time (git-of-theseus): whether generated + the SVG URL."""
    return AnalysisService(session).code_age_status(repository_id)


@router.post("/repositories/{repository_id}/code-age/run", response_model=CodeAgeResult)
def generate_code_age(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> CodeAgeResult:
    """(Re)generate the code-age stacked-area chart (git-of-theseus) for the current clone."""
    return AnalysisService(session).generate_code_age(repository_id)


@router.get("/repositories/{repository_id}/coupling", response_model=CouplingResult)
def coupling(repository_id: uuid.UUID, session: Session = Depends(get_session)) -> CouplingResult:
    """Temporal (change) coupling (code-maat): ranked pairs of files that change together."""
    return AnalysisService(session).coupling_status(repository_id)


@router.post("/repositories/{repository_id}/coupling/run", response_model=CouplingResult)
def generate_coupling(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> CouplingResult:
    """(Re)compute temporal coupling (code-maat) from the current clone's git history."""
    return AnalysisService(session).generate_coupling(repository_id)


@router.get(
    "/repositories/{repository_id}/dependency-freshness",
    response_model=DependencyFreshnessResult,
)
def dependency_freshness(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> DependencyFreshnessResult:
    """Cached latest-version / upgrade-gap check for the repo's dependencies (Python/pip)."""
    return AnalysisService(session).dependency_freshness_status(repository_id)


@router.post(
    "/repositories/{repository_id}/dependency-freshness/run",
    response_model=DependencyFreshnessResult,
)
def generate_dependency_freshness(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> DependencyFreshnessResult:
    """Fetch latest versions from PyPI, compute gaps, and summarize upgrade gains (blocking)."""
    return AnalysisService(session).generate_dependency_freshness(repository_id)


@router.get("/repositories/{repository_id}/architecture", response_model=ArchitectureResult)
def architecture(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> ArchitectureResult:
    """The architecture-diagram catalog with any previously generated Mermaid diagrams."""
    return AnalysisService(session).architecture_status(repository_id)


@router.post(
    "/repositories/{repository_id}/architecture/{kind}/run",
    response_model=ArchitectureResult,
)
def generate_architecture_diagram(
    repository_id: uuid.UUID, kind: str, session: Session = Depends(get_session)
) -> ArchitectureResult:
    """Generate one Mermaid architecture diagram (a hobit explores the clone; blocking)."""
    return AnalysisService(session).generate_architecture_diagram(repository_id, kind)


@router.get(
    "/repositories/{repository_id}/codebase-overview",
    response_model=CodebaseOverviewResult,
)
def codebase_overview(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> CodebaseOverviewResult:
    """The cached big-picture overview of what this codebase is."""
    return AnalysisService(session).codebase_overview_status(repository_id)


@router.post(
    "/repositories/{repository_id}/codebase-overview/run",
    response_model=CodebaseOverviewResult,
)
def generate_codebase_overview(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> CodebaseOverviewResult:
    """Have a hobit investigate the clone and write a crisp big-picture overview (blocking)."""
    return AnalysisService(session).generate_codebase_overview(repository_id)


@router.get("/repositories/{repository_id}/code-map", response_model=CodeMapResult)
def code_map(repository_id: uuid.UUID, session: Session = Depends(get_session)) -> CodeMapResult:
    """Code-city map (CodeCharta): whether generated + the viewer URL to iframe."""
    return AnalysisService(session).code_map_status(repository_id)


@router.post("/repositories/{repository_id}/code-map/run", response_model=CodeMapResult)
def generate_code_map(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> CodeMapResult:
    """(Re)generate the CodeCharta code-city map for the current clone."""
    return AnalysisService(session).generate_code_map(repository_id)
