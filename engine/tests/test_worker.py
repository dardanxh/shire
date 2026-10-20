"""Unit tests for the worker's pure logic: payload → EngineRequest mapping and the job
settlement paths of `_execute`. The db module is monkeypatched — no Postgres required."""

from __future__ import annotations

from typing import Any

import pytest

from engine import worker
from engine.model import EngineRequest, EngineResult
from engine.settings import EngineSettings


def _settings() -> EngineSettings:
    return EngineSettings(_env_file=None, database_url="postgresql://unit:test@nowhere/db")


def test_build_request_defaults_for_empty_payload() -> None:
    request = worker.build_request({"id": 1, "prompt": "analyze", "payload": None})
    assert request.prompt == "analyze"
    assert request.system is None
    assert request.cwd == "."
    assert request.allowed_tools == ("Read", "Grep", "Glob")
    assert request.model is None
    assert request.timeout_seconds == 500.0


def test_build_request_honors_payload_overrides() -> None:
    request = worker.build_request(
        {
            "id": 2,
            "prompt": "execute plan",
            "payload": {
                "system": "you are careful",
                "cwd": "/tmp/worktree",
                "allowed_tools": ["Read", "Edit", "Write"],
                "model": "claude-opus-4-6",
                "timeout_seconds": "90",
            },
        }
    )
    assert request.system == "you are careful"
    assert request.cwd == "/tmp/worktree"
    assert request.allowed_tools == ("Read", "Edit", "Write")
    assert request.model == "claude-opus-4-6"
    assert request.timeout_seconds == 90.0


class _FakeEngine:
    """Engine double: emits one progress event, then returns a canned result."""

    def __init__(self, result: EngineResult) -> None:
        self._result = result

    def available(self) -> bool:
        return True

    def run(self, request: EngineRequest, on_event=None) -> EngineResult:
        if on_event is not None:
            on_event({"type": "text", "text": "working"})
        return self._result


def test_execute_settles_successful_job(monkeypatch: pytest.MonkeyPatch) -> None:
    completions: list[dict[str, Any]] = []
    progress: list[list[dict]] = []
    monkeypatch.setattr(
        worker.db, "complete", lambda dsn, job_id, **kw: completions.append({"id": job_id, **kw})
    )
    monkeypatch.setattr(
        worker.db, "update_progress", lambda dsn, job_id, events: progress.append(list(events))
    )

    result = EngineResult(
        ok=True, text="all done", duration_seconds=1.5, usage={"input_tokens": 7}
    )
    job = {"id": 42, "kind": "test.kind", "prompt": "p", "payload": {}}
    worker._execute(_settings(), _FakeEngine(result), job)

    assert completions == [
        {
            "id": 42,
            "ok": True,
            "text": "all done",
            "error": None,
            "duration": 1.5,
            "usage": {"input_tokens": 7},
        }
    ]
    # The transcript event was flushed to the progress column.
    assert progress and progress[-1] == [{"type": "text", "text": "working"}]


def test_execute_settles_crashed_job_as_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    completions: list[dict[str, Any]] = []
    monkeypatch.setattr(
        worker.db, "complete", lambda dsn, job_id, **kw: completions.append({"id": job_id, **kw})
    )

    class _ExplodingEngine:
        def run(self, request: EngineRequest, on_event=None) -> EngineResult:
            raise RuntimeError("boom")

    job = {"id": 7, "kind": "test.kind", "prompt": "p", "payload": {}}
    worker._execute(_settings(), _ExplodingEngine(), job)

    assert len(completions) == 1
    settled = completions[0]
    assert settled["id"] == 7
    assert settled["ok"] is False
    assert settled["text"] == ""
    assert "engine worker crashed" in settled["error"]


def test_claim_params_kind_routing() -> None:
    from engine import db

    assert db.claim_params("w", None, None) == {"worker_id": "w", "include": None, "exclude": []}
    assert db.claim_params("w", ["launchpad.action"], ["x"]) == {
        "worker_id": "w",
        "include": ["launchpad.action"],
        "exclude": ["x"],
    }


def test_settings_kind_lists() -> None:
    settings = EngineSettings(
        _env_file=None, include_kinds=" launchpad.action, mcp.probe ,", exclude_kinds=""
    )
    assert settings.include_kinds_list == ["launchpad.action", "mcp.probe"]
    assert settings.exclude_kinds_list == []
    assert EngineSettings(_env_file=None).include_kinds_list is None


def test_probe_jobs_bypass_the_prompt_engine(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: dict[str, Any] = {}

    def fake_probe(**kwargs: Any) -> EngineResult:
        calls["probe"] = kwargs
        return EngineResult(ok=True, text='{"list_output": "", "tools": []}')

    def fake_complete(dsn: str, job_id: Any, **kwargs: Any) -> None:
        calls["complete"] = kwargs

    class NoEngine:
        def run(self, *args: Any, **kwargs: Any) -> EngineResult:
            raise AssertionError("probe must not go through engine.run")

    monkeypatch.setattr(worker, "run_probe", fake_probe)
    monkeypatch.setattr(worker.db, "complete", fake_complete)
    worker._execute(
        _settings(), NoEngine(), {"id": 7, "kind": "mcp.probe", "prompt": "p", "payload": {}}
    )
    assert calls["probe"]["model"] == "haiku"
    assert calls["complete"]["ok"] is True


def test_parse_tool_names() -> None:
    from engine.mcp_probe import parse_tool_names

    text = "mcp__a_b__getX\n- mcp__a_b__getX\nmcp__c__do_thing, not_a_tool"
    assert parse_tool_names(text) == ["mcp__a_b__getX", "mcp__c__do_thing"]


def test_connected_prefixes() -> None:
    from engine.mcp_probe import connected_prefixes

    listing = (
        "Checking MCP server health\u2026\n\n"
        "claude.ai PPRO Miro: https://miro.example/mcp - \u2714 Connected\n"
        "claude.ai PPRO Slack: https://slack.example/mcp - ! Needs authentication\n"
        "claude.ai PPRO Google Workspace: https://g.example/mcp - \u2714 Connected\n"
    )
    assert connected_prefixes(listing) == [
        "mcp__claude_ai_PPRO_Miro",
        "mcp__claude_ai_PPRO_Google_Workspace",
    ]
