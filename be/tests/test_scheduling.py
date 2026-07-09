"""Unit tests for the Phase 2.5 scheduling helpers — pure functions, no DB or Prefect server."""

from __future__ import annotations

import uuid

import pytest
from prefect.client.schemas.schedules import CronSchedule, IntervalSchedule

from hobits.orchestration.schedule_sync import (
    _schedule_for,
    deployment_name,
    validate_cadence,
)


def test_schedule_for_presets() -> None:
    assert _schedule_for("manual") is None
    assert isinstance(_schedule_for("hourly"), IntervalSchedule)
    assert isinstance(_schedule_for("daily"), CronSchedule)
    assert isinstance(_schedule_for("weekly"), CronSchedule)


def test_schedule_for_custom_cron() -> None:
    schedule = _schedule_for("cron:0 9 * * 1-5")
    assert isinstance(schedule, CronSchedule)
    assert schedule.cron == "0 9 * * 1-5"


def test_schedule_for_unrecognized_is_manual() -> None:
    # Unknown cadences degrade to "no schedule" rather than raising, so a bad row can't wedge sync.
    assert _schedule_for("every-blue-moon") is None
    assert _schedule_for("cron:") is None


@pytest.mark.parametrize("cadence", ["manual", "hourly", "daily", "weekly", "cron:*/5 * * * *"])
def test_validate_cadence_accepts_valid(cadence: str) -> None:
    validate_cadence(cadence)  # should not raise


@pytest.mark.parametrize("cadence", ["", "nonsense", "cron:", "cron:not a cron"])
def test_validate_cadence_rejects_invalid(cadence: str) -> None:
    with pytest.raises(ValueError):
        validate_cadence(cadence)


def test_deployment_name_is_stable_and_unique() -> None:
    rid = uuid.UUID("00000000-0000-0000-0000-0000000000ab")
    assert deployment_name(rid, "security-auditor") == f"{rid}--security-auditor"
    # Different hobit → different deployment name for the same repo.
    assert deployment_name(rid, "a") != deployment_name(rid, "b")
