"""Settings parsing: ENGINE_-prefixed env vars, defaults, and the worker identity."""

from __future__ import annotations

import os
import socket

import pytest

from engine.settings import EngineSettings


@pytest.fixture(autouse=True)
def _clean_engine_env(monkeypatch: pytest.MonkeyPatch):
    """Keep ambient ENGINE_* vars (operator shell, .env exports) out of the tests."""
    for key in list(os.environ):
        if key.startswith("ENGINE_"):
            monkeypatch.delenv(key)
    return monkeypatch


def test_defaults_and_worker_identity() -> None:
    settings = EngineSettings(_env_file=None)
    assert settings.database_url == "postgresql://shire:shire@localhost:5433/shire"
    assert settings.claude_binary == "claude"
    assert settings.use_api_key is False
    assert settings.concurrency == 2
    assert settings.max_attempts == 2
    # worker_id is the host:pid identity used by recover_own to reclaim only its own jobs.
    assert settings.worker_id == f"{socket.gethostname()}:{os.getpid()}"


def test_env_vars_override_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENGINE_DATABASE_URL", "postgresql://u:p@db:5432/jobs")
    monkeypatch.setenv("ENGINE_USE_API_KEY", "true")
    monkeypatch.setenv("ENGINE_CONCURRENCY", "8")
    monkeypatch.setenv("ENGINE_POLL_INTERVAL_SECONDS", "2.5")
    monkeypatch.setenv("ENGINE_WORKER_ID", "test-host:123")

    settings = EngineSettings(_env_file=None)
    assert settings.database_url == "postgresql://u:p@db:5432/jobs"
    assert settings.use_api_key is True
    assert settings.concurrency == 8
    assert settings.poll_interval_seconds == 2.5
    assert settings.worker_id == "test-host:123"
