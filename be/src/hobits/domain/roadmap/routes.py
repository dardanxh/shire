"""FastAPI routes for the roadmap domain. HTTP concerns only — logic lives in the service."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from hobits.core.db import get_session
from hobits.core.pagination import Page, PaginationParams
from hobits.domain.roadmap.schemas import (
    BurnupResult,
    CreateItemDependency,
    CreateRoadmap,
    ExportIssuesRequest,
    ExportIssuesResult,
    RadarResult,
    RefreshPrsResult,
    RepoRoadmapSliceResult,
    RoadmapConfigResult,
    RoadmapDetailResult,
    RoadmapDriftCheckResult,
    RoadmapDriftStatusResult,
    RoadmapExecutionResult,
    RoadmapItemResult,
    RoadmapResult,
    RoadmapVersionResult,
    UpdateRoadmap,
    UpdateRoadmapConfig,
    UpdateRoadmapItem,
)
from hobits.domain.roadmap.services import RoadmapService

router = APIRouter(prefix="/roadmaps", tags=["roadmaps"])

# Repo-scoped routes live under /repositories/* (the principles-router pattern), so they get
# their own unprefixed router — registered alongside `router` in main.py.
repo_router = APIRouter(tags=["roadmaps"])


@repo_router.get(
    "/repositories/{repository_id}/roadmaps",
    response_model=list[RepoRoadmapSliceResult],
)
def repository_roadmaps(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> list[RepoRoadmapSliceResult]:
    """Every roadmap covering this repository, sliced to its items only — the repository
    detail's Roadmaps tab."""
    return RoadmapService(session).for_repository(repository_id)


# --- roadmaps -------------------------------------------------------------------------


@router.post("", response_model=RoadmapDetailResult, status_code=status.HTTP_201_CREATED)
def create_roadmap(
    body: CreateRoadmap, session: Session = Depends(get_session)
) -> RoadmapDetailResult:
    """Create a roadmap over the selected repositories and enqueue its first generation
    (non-blocking — poll the detail until the generation settles)."""
    return RoadmapService(session).create(body)


@router.get("", response_model=Page[RoadmapResult])
def list_roadmaps(
    params: PaginationParams = Depends(), session: Session = Depends(get_session)
) -> Page[RoadmapResult]:
    """Every roadmap with its scope and current-version progress, newest activity first."""
    return RoadmapService(session).list(params)


# --- config (declared before /{roadmap_id} so "config" never parses as a UUID) ----------


@router.get("/config", response_model=RoadmapConfigResult)
def get_config(session: Session = Depends(get_session)) -> RoadmapConfigResult:
    return RoadmapService(session).get_config()


@router.put("/config", response_model=RoadmapConfigResult)
def update_config(
    body: UpdateRoadmapConfig, session: Session = Depends(get_session)
) -> RoadmapConfigResult:
    """Save execution timeout + drift cadence, and reconcile the Prefect schedule."""
    return RoadmapService(session).update_config(body)


@router.get("/{roadmap_id}", response_model=RoadmapDetailResult)
def get_roadmap(
    roadmap_id: uuid.UUID,
    version: int | None = None,
    session: Session = Depends(get_session),
) -> RoadmapDetailResult:
    """The full plan: milestones, items, dependencies and assessments. `version` renders a
    historical (read-only) version; omit it for the current one."""
    return RoadmapService(session).get(roadmap_id, version_number=version)


@router.put("/{roadmap_id}", response_model=RoadmapDetailResult)
def update_roadmap(
    roadmap_id: uuid.UUID, body: UpdateRoadmap, session: Session = Depends(get_session)
) -> RoadmapDetailResult:
    """Edit name/goal/repositories — affects the next generated version, never the current."""
    return RoadmapService(session).update(roadmap_id, body)


@router.delete("/{roadmap_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_roadmap(roadmap_id: uuid.UUID, session: Session = Depends(get_session)) -> None:
    RoadmapService(session).delete(roadmap_id)


# --- versions -------------------------------------------------------------------------


@router.post(
    "/{roadmap_id}/versions",
    response_model=RoadmapVersionResult,
    status_code=status.HTTP_202_ACCEPTED,
)
def regenerate_roadmap(
    roadmap_id: uuid.UUID, session: Session = Depends(get_session)
) -> RoadmapVersionResult:
    """Re-plan: insert version N+1 and enqueue its generation. Done items (and in-progress
    items with an open PR) carry over when it lands (non-blocking — poll the detail)."""
    return RoadmapService(session).regenerate(roadmap_id)


@router.get("/{roadmap_id}/versions", response_model=list[RoadmapVersionResult])
def list_versions(
    roadmap_id: uuid.UUID, session: Session = Depends(get_session)
) -> list[RoadmapVersionResult]:
    """Version history, newest first — the detail view's version switcher."""
    return RoadmapService(session).list_versions(roadmap_id)


# --- execution ---------------------------------------------------------------------------


@router.post(
    "/{roadmap_id}/items/{item_id}/execute",
    response_model=RoadmapExecutionResult,
    status_code=status.HTTP_202_ACCEPTED,
)
def execute_item(
    roadmap_id: uuid.UUID, item_id: uuid.UUID, session: Session = Depends(get_session)
) -> RoadmapExecutionResult:
    """Have the AI implement this item: isolated worktree → branch → push → pull request
    (non-blocking — the item shows the PR once the run settles)."""
    return RoadmapService(session).execute_item(roadmap_id, item_id)


@router.get("/{roadmap_id}/executions", response_model=list[RoadmapExecutionResult])
def list_executions(
    roadmap_id: uuid.UUID,
    item_id: uuid.UUID | None = None,
    session: Session = Depends(get_session),
) -> list[RoadmapExecutionResult]:
    """Execution history for the current version (or one item), newest first."""
    return RoadmapService(session).list_executions(roadmap_id, item_id=item_id)


@router.post("/{roadmap_id}/refresh-prs", response_model=RefreshPrsResult)
def refresh_prs(roadmap_id: uuid.UUID, session: Session = Depends(get_session)) -> RefreshPrsResult:
    """Check the provider for merged/closed PRs: merged completes the item, closed bounces it
    back to 'to do'."""
    return RoadmapService(session).refresh_executions(roadmap_id)


# --- drift ---------------------------------------------------------------------------------


@router.post(
    "/{roadmap_id}/drift",
    response_model=list[RoadmapDriftCheckResult],
    status_code=status.HTTP_202_ACCEPTED,
)
def run_drift(
    roadmap_id: uuid.UUID, session: Session = Depends(get_session)
) -> list[RoadmapDriftCheckResult]:
    """Check the plan against reality: one read-only engine job per repository with open items
    (non-blocking — poll GET /drift)."""
    return RoadmapService(session).run_drift(roadmap_id)


@router.get("/{roadmap_id}/drift", response_model=RoadmapDriftStatusResult)
def drift_status(
    roadmap_id: uuid.UUID, session: Session = Depends(get_session)
) -> RoadmapDriftStatusResult:
    """Recent drift checks plus every open finding awaiting an accept/dismiss decision."""
    return RoadmapService(session).drift_status(roadmap_id)


@router.post("/{roadmap_id}/drift/findings/{finding_id}/accept", response_model=RoadmapItemResult)
def accept_drift_finding(
    roadmap_id: uuid.UUID, finding_id: uuid.UUID, session: Session = Depends(get_session)
) -> RoadmapItemResult:
    """Apply the verdict: the item closes as done."""
    return RoadmapService(session).accept_drift_finding(roadmap_id, finding_id)


@router.post(
    "/{roadmap_id}/drift/findings/{finding_id}/dismiss",
    status_code=status.HTTP_204_NO_CONTENT,
)
def dismiss_drift_finding(
    roadmap_id: uuid.UUID, finding_id: uuid.UUID, session: Session = Depends(get_session)
) -> None:
    RoadmapService(session).dismiss_drift_finding(roadmap_id, finding_id)


@router.post("/{roadmap_id}/export/issues", response_model=ExportIssuesResult)
def export_issues(
    roadmap_id: uuid.UUID,
    body: ExportIssuesRequest,
    session: Session = Depends(get_session),
) -> ExportIssuesResult:
    """Push open items as provider issues (GitHub/GitLab); unexportable items are skipped."""
    return RoadmapService(session).export_issues(roadmap_id, body)


# --- charts / export --------------------------------------------------------------------


@router.get("/{roadmap_id}/charts/burnup", response_model=BurnupResult)
def burnup_chart(
    roadmap_id: uuid.UUID,
    days: int = Query(90, ge=7, le=365),
    session: Session = Depends(get_session),
) -> BurnupResult:
    """Scope vs completion per day for the current version (from the item event log)."""
    return RoadmapService(session).burnup(roadmap_id, days=days)


@router.get("/{roadmap_id}/charts/radar", response_model=RadarResult)
def radar_chart(roadmap_id: uuid.UUID, session: Session = Depends(get_session)) -> RadarResult:
    """Per-repo health assessments of the last two ready versions."""
    return RoadmapService(session).radar(roadmap_id)


@router.get("/{roadmap_id}/export/markdown", response_class=Response)
def export_markdown(roadmap_id: uuid.UUID, session: Session = Depends(get_session)) -> Response:
    """The current version rendered as a downloadable markdown document."""
    markdown, filename = RoadmapService(session).export_markdown(roadmap_id)
    return Response(
        content=markdown,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --- items ----------------------------------------------------------------------------


@router.patch("/{roadmap_id}/items/{item_id}", response_model=RoadmapItemResult)
def update_item(
    roadmap_id: uuid.UUID,
    item_id: uuid.UUID,
    body: UpdateRoadmapItem,
    session: Session = Depends(get_session),
) -> RoadmapItemResult:
    """Partial item edit. Status changes are validated against the transition table; status,
    priority and effort changes append history events (the burnup source)."""
    return RoadmapService(session).update_item(roadmap_id, item_id, body)


@router.post(
    "/{roadmap_id}/items/{item_id}/dependencies",
    response_model=RoadmapItemResult,
    status_code=status.HTTP_201_CREATED,
)
def add_dependency(
    roadmap_id: uuid.UUID,
    item_id: uuid.UUID,
    body: CreateItemDependency,
    session: Session = Depends(get_session),
) -> RoadmapItemResult:
    """Declare that the item is blocked by another item of the same version (cycles rejected)."""
    return RoadmapService(session).add_dependency(roadmap_id, item_id, body)


@router.delete(
    "/{roadmap_id}/items/{item_id}/dependencies/{depends_on_item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_dependency(
    roadmap_id: uuid.UUID,
    item_id: uuid.UUID,
    depends_on_item_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> None:
    RoadmapService(session).remove_dependency(roadmap_id, item_id, depends_on_item_id)
