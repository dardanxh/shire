"""Unit tests for the Claude CLI engine: argv construction, env auth handling, envelope
parsing, and the never-raises failure contract. No claude binary or network needed."""

from __future__ import annotations

from engine.claude_cli import (
    ClaudeCliEngine,
    _claude_env,
    _compact_events,
    _extract_text,
    _extract_usage,
)
from engine.model import EngineRequest


def test_build_argv_full_request() -> None:
    engine = ClaudeCliEngine(binary="claude-bin")
    request = EngineRequest(
        prompt="summarize the repo",
        system="be terse",
        cwd="/tmp/clone",
        allowed_tools=("Read", "Edit", "Write"),
        model="claude-sonnet-4-5",
        timeout_seconds=120.0,
    )
    argv = engine._build_argv(request)

    assert argv[:3] == ["claude-bin", "-p", "summarize the repo"]
    # Headless runs must be isolated from every settings file (user hooks + untrusted repo).
    assert argv[argv.index("--setting-sources") + 1] == ""
    assert argv[argv.index("--output-format") + 1] == "stream-json"
    assert "--verbose" in argv
    assert argv[argv.index("--model") + 1] == "claude-sonnet-4-5"
    assert argv[argv.index("--append-system-prompt") + 1] == "be terse"
    i = argv.index("--allowedTools")
    assert argv[i + 1 : i + 4] == ["Read", "Edit", "Write"]
    # `default` in --print mode auto-denies anything outside the allow-list.
    assert argv[-2:] == ["--permission-mode", "default"]


def test_build_argv_minimal_omits_optional_flags() -> None:
    engine = ClaudeCliEngine()
    argv = engine._build_argv(EngineRequest(prompt="hi", cwd="."))

    assert "--model" not in argv
    assert "--append-system-prompt" not in argv
    # Default read-only allow-list still applies.
    i = argv.index("--allowedTools")
    assert argv[i + 1 : i + 4] == ["Read", "Grep", "Glob"]


def test_claude_env_strips_api_key_unless_opted_in(monkeypatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-secret")
    monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "oauth-token")

    stripped = _claude_env(use_api_key=False)
    assert "ANTHROPIC_API_KEY" not in stripped
    assert stripped["CLAUDE_CODE_OAUTH_TOKEN"] == "oauth-token"

    passed = _claude_env(use_api_key=True)
    assert passed["ANTHROPIC_API_KEY"] == "sk-secret"


def test_run_with_missing_binary_returns_failure_not_raise(tmp_path) -> None:
    engine = ClaudeCliEngine(binary="definitely-not-a-real-binary-xyz")
    result = engine.run(EngineRequest(prompt="hi", cwd=str(tmp_path)))

    assert result.ok is False
    assert result.text == ""
    assert "could not launch 'definitely-not-a-real-binary-xyz'" in (result.error or "")


def test_extract_text_success_error_and_malformed() -> None:
    assert _extract_text({"subtype": "success", "result": "the answer"}) == ("the answer", None)

    text, err = _extract_text({"is_error": True, "subtype": "error_max_turns", "result": "partial"})
    assert text == "partial"
    assert err == "claude error result: error_max_turns: partial"

    # Auth failures come back as subtype "success" + is_error — the result text is the story.
    text, err = _extract_text(
        {"is_error": True, "subtype": "success", "result": "Not logged in · Please run /login"}
    )
    assert text == "Not logged in · Please run /login"
    assert err == "claude error result: Not logged in · Please run /login"

    text, err = _extract_text({"subtype": "success", "result": None})
    assert text == ""
    assert err == "claude result envelope had no text"


def test_extract_usage_flattens_envelope() -> None:
    envelope = {
        "usage": {"input_tokens": 10, "output_tokens": 5, "cache_read_input_tokens": 3},
        "total_cost_usd": 0.02,
        "num_turns": 4,
        "modelUsage": {"claude-sonnet-4-5": {}, "claude-haiku-4": {}},
    }
    usage = _extract_usage(envelope)
    assert usage == {
        "input_tokens": 10,
        "output_tokens": 5,
        "cache_creation_input_tokens": None,
        "cache_read_input_tokens": 3,
        "total_cost_usd": 0.02,
        "num_turns": 4,
        "models": ["claude-haiku-4", "claude-sonnet-4-5"],
    }
    assert _extract_usage({"result": "no usage block"}) is None


def test_compact_events_squashes_stream_json() -> None:
    assistant = {
        "type": "assistant",
        "message": {
            "content": [
                {"type": "text", "text": "thinking about it"},
                {"type": "tool_use", "name": "Read", "input": {"file_path": "/tmp/a.py"}},
            ]
        },
    }
    entries = _compact_events(assistant)
    assert entries == [
        {"type": "text", "text": "thinking about it"},
        {"type": "tool", "tool": "Read", "detail": "/tmp/a.py"},
    ]

    user = {
        "type": "user",
        "message": {
            "content": [
                {"type": "tool_result", "content": "line one\n  line two", "is_error": True}
            ]
        },
    }
    assert _compact_events(user) == [
        {"type": "tool_result", "detail": "line one line two", "error": True}
    ]

    # Non-message events (system init, etc.) produce nothing.
    assert _compact_events({"type": "system", "subtype": "init"}) == []
