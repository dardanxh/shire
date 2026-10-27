"""FastAPI routes for AI Actions. HTTP concerns only — logic lives in the service.

`/ai-actions/runner` is declared before `/ai-actions/{action_id}` so the static segment isn't
swallowed by the UUID path param.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Response, status
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.domain.ai_actions.schemas import (
    AiActionResult,
    AiActionRunnerResult,
    CreateAiAction,
    RunAiAction,
    UpdateAiAction,
)
from shire.domain.ai_actions.services import AiActionService

router = APIRouter(prefix="/ai-actions", tags=["ai-actions"])

# The report is model-written HTML built from untrusted data (Slack messages, ticket text).
# Served on the API origin, so it is sandboxed: an opaque origin that can run its own inline
# scripts (report templates sort/filter tables) but can't reach the app, its storage or the API.
_REPORT_CSP = (
    "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; "
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; "
    "img-src data: https:; font-src data:"
)


@router.get("", response_model=list[AiActionResult])
def list_ai_actions(session: Session = Depends(get_session)) -> list[AiActionResult]:
    """Every action with its latest run, alphabetical."""
    return AiActionService(session).list()


@router.post("", response_model=AiActionResult, status_code=status.HTTP_201_CREATED)
def create_ai_action(
    body: CreateAiAction, session: Session = Depends(get_session)
) -> AiActionResult:
    return AiActionService(session).create(body)


@router.get("/runner", response_model=AiActionRunnerResult)
def get_ai_actions_runner(session: Session = Depends(get_session)) -> AiActionRunnerResult:
    """Whether the host runner is connected — without it, runs wait in the queue."""
    return AiActionService(session).runner()


@router.get("/{action_id}", response_model=AiActionResult)
def get_ai_action(action_id: uuid.UUID, session: Session = Depends(get_session)) -> AiActionResult:
    return AiActionService(session).get(action_id)


@router.put("/{action_id}", response_model=AiActionResult)
def update_ai_action(
    action_id: uuid.UUID, body: UpdateAiAction, session: Session = Depends(get_session)
) -> AiActionResult:
    return AiActionService(session).update(action_id, body)


@router.delete("/{action_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ai_action(action_id: uuid.UUID, session: Session = Depends(get_session)) -> Response:
    AiActionService(session).delete(action_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{action_id}/run", response_model=AiActionResult)
def run_ai_action(
    action_id: uuid.UUID,
    body: RunAiAction | None = None,
    session: Session = Depends(get_session),
) -> AiActionResult:
    """Queue a run now, regardless of the schedule. `arguments` are appended to the prompt."""
    return AiActionService(session).run(action_id, arguments=body.arguments if body else "")


@router.post("/{action_id}/cancel", response_model=AiActionResult)
def cancel_ai_action_run(
    action_id: uuid.UUID, session: Session = Depends(get_session)
) -> AiActionResult:
    """Withdraw a queued run that no worker has picked up yet."""
    return AiActionService(session).cancel(action_id)


@router.get("/{action_id}/report", response_class=HTMLResponse)
def get_ai_action_report(
    action_id: uuid.UUID, download: bool = False, session: Session = Depends(get_session)
) -> HTMLResponse:
    """The latest report as a standalone, sandboxed page (`?download=true` to save it)."""
    html = AiActionService(session).report_html(action_id)
    headers = {"Content-Security-Policy": _REPORT_CSP, "X-Content-Type-Options": "nosniff"}
    if download:
        headers["Content-Disposition"] = f'attachment; filename="ai-action-{action_id}.html"'
    return HTMLResponse(html, headers=headers)
