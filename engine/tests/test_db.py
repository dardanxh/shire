"""Claim routing parameters — pure, no Postgres."""

from __future__ import annotations

from engine import db
from engine.settings import EngineSettings


def test_claim_params_default_routes_everything() -> None:
    params = db.claim_params("w1", None, None)
    assert params == {"worker_id": "w1", "include": None, "exclude": []}


def test_claim_params_include_and_exclude() -> None:
    params = db.claim_params("w1", ["ai_action.run"], ["x.y"])
    assert params["include"] == ["ai_action.run"]
    assert params["exclude"] == ["x.y"]


def test_settings_split_kind_lists() -> None:
    settings = EngineSettings(
        _env_file=None, include_kinds=" ai_action.run , ", exclude_kinds="a,b"
    )
    assert settings.include_kinds_list == ["ai_action.run"]
    assert settings.exclude_kinds_list == ["a", "b"]
    assert EngineSettings(_env_file=None).include_kinds_list is None
