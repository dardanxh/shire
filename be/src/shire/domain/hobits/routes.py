"""FastAPI routes for the hobits domain — config, runs, and the run trigger."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.domain.hobits.schemas import (
    CreateHobit,
    HobitAssignmentResult,
    HobitConfigUpdate,
    HobitGuidanceResult,
    HobitResult,
    HobitRunDetailResult,
    HobitRunFeedbackResult,
    HobitRunResult,
    SetCadenceRequest,
    SetRepoHobitsRequest,
    UpdateHobit,
    UpsertHobitRunFeedback,
)
from shire.domain.hobits.services import HobitService

router = APIRouter(tags=["hobits"])


@router.get("/hobits", response_model=list[HobitResult])
def list_hobits(session: Session = Depends(get_session)) -> list[HobitResult]:
    return HobitService(session).list_hobits()


@router.post("/hobits", response_model=HobitResult, status_code=status.HTTP_201_CREATED)
def create_hobit(
    body: CreateHobit, session: Session = Depends(get_session)
) -> HobitResult:
    """Create a user-authored (custom) hobit."""
    return HobitService(session).create_hobit(body)


@router.get("/hobits/{slug}", response_model=HobitResult)
def get_hobit(slug: str, session: Session = Depends(get_session)) -> HobitResult:
    return HobitService(session).get_hobit_result(slug)


@router.put("/hobits/{slug}", response_model=HobitResult)
def update_hobit_config(
    slug: str, body: HobitConfigUpdate, session: Session = Depends(get_session)
) -> HobitResult:
    """Save the hobit's config (model, charter, timeout). For a built-in hobit this is
    stored as an override; for a custom hobit it edits the hobit directly."""
    return HobitService(session).update_config(slug, body)


@router.put("/hobits/{slug}/definition", response_model=HobitResult)
def update_hobit_definition(
    slug: str, body: UpdateHobit, session: Session = Depends(get_session)
) -> HobitResult:
    """Fully edit a custom hobit (name, description, category + config). Custom hobits only."""
    return HobitService(session).update_hobit(slug, body)


@router.delete("/hobits/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_hobit(slug: str, session: Session = Depends(get_session)) -> None:
    """Delete a hobit and everything tied to it (runs, briefing items, assignments). Built-in
    hobits are tombstoned (their code-roster spec stays hidden); custom ones are dropped. The
    foundational onboarding hobit can't be deleted."""
    HobitService(session).delete_hobit(slug)


@router.get("/hobits/{slug}/runs", response_model=list[HobitRunResult])
def list_hobit_runs(slug: str, session: Session = Depends(get_session)) -> list[HobitRunResult]:
    """This hobit's runs across every repository, newest first."""
    return HobitService(session).list_hobit_runs(slug)


@router.get("/hobits/{slug}/assignments", response_model=list[HobitAssignmentResult])
def list_hobit_assignments(
    slug: str, session: Session = Depends(get_session)
) -> list[HobitAssignmentResult]:
    """The repositories this hobit is assigned to, each with its run schedule."""
    return HobitService(session).list_assignments(slug)


@router.get("/hobits/{slug}/guidance", response_model=HobitGuidanceResult)
def get_hobit_guidance(slug: str, session: Session = Depends(get_session)) -> HobitGuidanceResult:
    """The hobit's standing guidance distilled from run feedback (empty until distilled)."""
    return HobitService(session).get_guidance(slug)


@router.post("/hobits/{slug}/guidance/distill", response_model=HobitGuidanceResult)
def distill_hobit_guidance(
    slug: str, session: Session = Depends(get_session)
) -> HobitGuidanceResult:
    """Force a feedback-distillation job now (async — poll GET .../guidance for the result)."""
    return HobitService(session).trigger_distill(slug)


@router.get("/repositories/{repository_id}/hobits", response_model=list[HobitResult])
def list_repo_hobits(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> list[HobitResult]:
    """The hobits assigned to this repository (its access allow-list)."""
    return HobitService(session).list_repo_hobits(repository_id)


@router.put("/repositories/{repository_id}/hobits", response_model=list[HobitResult])
def set_repo_hobits(
    repository_id: uuid.UUID,
    body: SetRepoHobitsRequest,
    session: Session = Depends(get_session),
) -> list[HobitResult]:
    """Replace the hobits assigned to this repository."""
    return HobitService(session).set_repo_hobits(repository_id, body.slugs)


@router.put(
    "/repositories/{repository_id}/hobits/{slug}/cadence",
    response_model=list[HobitResult],
)
def set_hobit_cadence(
    repository_id: uuid.UUID,
    slug: str,
    body: SetCadenceRequest,
    session: Session = Depends(get_session),
) -> list[HobitResult]:
    """Set how often a hobit runs on this repo (manual | hourly | daily | weekly | cron:<expr>)."""
    return HobitService(session).set_cadence(repository_id, slug, body.cadence)


@router.post(
    "/repositories/{repository_id}/hobits/{slug}/run", response_model=HobitRunResult
)
def run_hobit(
    repository_id: uuid.UUID, slug: str, session: Session = Depends(get_session)
) -> HobitRunResult:
    """Run a hobit against a repository (blocking — the agent explores the clone)."""
    return HobitService(session).run_hobit(repository_id, slug)


@router.post(
    "/repositories/{repository_id}/hobits/{slug}/refresh", response_model=HobitRunResult
)
def refresh_hobit(
    repository_id: uuid.UUID, slug: str, session: Session = Depends(get_session)
) -> HobitRunResult:
    """Run the change gate on demand: run only if the repo moved since the last result, else skip
    (the same logic the scheduler applies). Blocking when it does run."""
    return HobitService(session).run_if_stale(repository_id, slug)


@router.get(
    "/repositories/{repository_id}/hobits/runs", response_model=list[HobitRunResult]
)
def list_repo_runs(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> list[HobitRunResult]:
    return HobitService(session).list_runs(repository_id)


@router.get(
    "/repositories/{repository_id}/hobits/runs/{run_id}",
    response_model=HobitRunDetailResult,
)
def get_run(
    repository_id: uuid.UUID, run_id: uuid.UUID, session: Session = Depends(get_session)
) -> HobitRunDetailResult:
    return HobitService(session).get_run(run_id)


@router.put(
    "/repositories/{repository_id}/hobits/runs/{run_id}/feedback",
    response_model=HobitRunFeedbackResult,
)
def upsert_run_feedback(
    repository_id: uuid.UUID,
    run_id: uuid.UUID,
    body: UpsertHobitRunFeedback,
    session: Session = Depends(get_session),
) -> HobitRunFeedbackResult:
    """Rate a run's response 1-5 stars with an optional comment (one per run; PUT replaces it).
    Feedback tunes the hobit's future runs — raw in the next prompt, distilled over time."""
    return HobitService(session).upsert_feedback(repository_id, run_id, body)


@router.delete(
    "/repositories/{repository_id}/hobits/runs/{run_id}/feedback",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_run_feedback(
    repository_id: uuid.UUID, run_id: uuid.UUID, session: Session = Depends(get_session)
) -> None:
    HobitService(session).delete_feedback(repository_id, run_id)
