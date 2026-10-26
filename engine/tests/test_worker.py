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


def test_build_request_rejects_unknown_permission_mode() -> None:
    with pytest.raises(ValueError):
        worker.build_request(
            {"id": 3, "prompt": "p", "payload": {"permission_mode": "acceptEdits"}}
        )


def test_result_file_name_must_be_a_plain_name() -> None:
    assert worker.result_file_name({}) is None
    assert worker.result_file_name({"result_file": "report.html"}) == "report.html"
    for bad in ("../etc/passwd", "/tmp/x.html", "sub/report.html", ".env", ".."):
        with pytest.raises(ValueError):
            worker.result_file_name({"result_file": bad})


class _FileWritingEngine:
    """Engine double that writes the deliverable where the system prompt says to."""

    def __init__(self, content: str | None) -> None:
        self._content = content
        self.request: EngineRequest | None = None

    def run(self, request: EngineRequest, on_event=None) -> EngineResult:
        self.request = request
        if self._content is not None:
            target = request.system.split("WRITE TO ", 1)[1].strip()
            with open(target, "w", encoding="utf-8") as fh:
                fh.write(self._content)
        return EngineResult(ok=True, text="Report written.", duration_seconds=2.0)


def _file_job(tmp_path) -> dict[str, Any]:
    return {
        "id": 11,
        "kind": "test.kind",
        "prompt": "p",
        "payload": {
            "cwd": str(tmp_path),
            "system": f"WRITE TO {worker.RESULT_FILE_TOKEN}",
            "result_file": "report.html",
        },
    }


def test_execute_returns_result_file_and_cleans_workspace(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    completions: list[dict[str, Any]] = []
    monkeypatch.setattr(
        worker.db, "complete", lambda dsn, job_id, **kw: completions.append({"id": job_id, **kw})
    )
    engine = _FileWritingEngine("<html><body>hi</body></html>")
    worker._execute(_settings(), engine, _file_job(tmp_path))

    assert completions[0]["ok"] is True
    assert completions[0]["text"] == "<html><body>hi</body></html>"
    # Ran in its own scratch directory under the payload cwd, removed afterwards.
    assert engine.request is not None
    assert engine.request.cwd != str(tmp_path)
    assert engine.request.cwd.startswith(str(tmp_path))
    assert list(tmp_path.iterdir()) == []


def test_execute_falls_back_to_text_when_no_file_written(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    completions: list[dict[str, Any]] = []
    monkeypatch.setattr(
        worker.db, "complete", lambda dsn, job_id, **kw: completions.append({"id": job_id, **kw})
    )
    worker._execute(_settings(), _FileWritingEngine(None), _file_job(tmp_path))
    assert completions[0]["text"] == "Report written."
    assert list(tmp_path.iterdir()) == []
