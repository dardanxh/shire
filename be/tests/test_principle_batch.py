"""Batched check sessions: prompt builders and the batch parsers.

Pure-function tests (no DB, no engine) — the batch prompt must carry every principle exactly
once, and the parsers must degrade per entry, not per batch.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

from shire.domain.merge_review.mr_hobit import (
    MrContext,
    build_hobit_review_batch_prompt,
    build_principle_check_batch_prompt,
    parse_review_batch,
)
from shire.domain.principles.jobs import (
    BATCH_MAX_VIOLATIONS,
    build_audit_batch_prompt,
    format_principles_section,
    parse_batch_verdicts,
    parse_verdict,
)


def _principle(name: str, severity: str = "should", statement: str = "Keep it simple."):
    return SimpleNamespace(name=name, severity=severity, statement=statement)


def _ctx() -> MrContext:
    return MrContext(
        repo_slug="acme/app",
        source_branch="feature",
        target_branch="main",
        clone_path="/tmp/clone",
        context_markdown="CONTEXT-PACK-MARKER",
        footprint_summary="- Size: small",
        diff_excerpt="DIFF-MARKER",
    )


def _batch_result(entries: list[dict]) -> str:
    return "exploration notes...\n```json\n" + json.dumps({"results": entries}) + "\n```"


# --- prompt builders ---------------------------------------------------------------------------


def test_audit_batch_prompt_numbers_every_principle() -> None:
    principles = [_principle("No raw SQL"), _principle("Small functions", "must")]
    prompt = build_audit_batch_prompt("acme/app", principles)
    assert "### Principle 1: No raw SQL (severity: should)" in prompt
    assert "### Principle 2: Small functions (severity: must)" in prompt
    assert str(BATCH_MAX_VIOLATIONS) in prompt
    assert '"results"' in prompt
    assert "Every principle must appear exactly once" in prompt


def test_principles_section_is_shared_shape() -> None:
    section = format_principles_section([_principle("A"), _principle("B")])
    assert section.startswith("## The principles")
    assert "### Principle 1: A" in section and "### Principle 2: B" in section


def test_mr_batch_prompt_emits_preamble_once() -> None:
    prompt = build_principle_check_batch_prompt(
        _ctx(), [_principle("A"), _principle("B")], max_violations=BATCH_MAX_VIOLATIONS
    )
    assert prompt.count("CONTEXT-PACK-MARKER") == 1
    assert prompt.count("DIFF-MARKER") == 1
    assert "the changes in this merge request" in prompt
    assert "### Principle 2: B" in prompt


def test_hobit_review_batch_prompt_sections_and_contract() -> None:
    prompt = build_hobit_review_batch_prompt(
        _ctx(),
        [
            ("mr-diff-correctness", "Diff Correctness", "You are precise.", "Find bugs."),
            ("mr-security-diff", "Security", "You are paranoid.", "Find leaks."),
        ],
    )
    assert prompt.count("CONTEXT-PACK-MARKER") == 1
    assert "## Reviewer 1: Diff Correctness (slug: mr-diff-correctness)" in prompt
    assert "## Reviewer 2: Security (slug: mr-security-diff)" in prompt
    assert "You are paranoid." in prompt
    assert '"reviews"' in prompt


# --- parse_batch_verdicts ----------------------------------------------------------------------


def test_parse_batch_happy_path() -> None:
    text = _batch_result(
        [
            {"index": 1, "verdict": "upheld", "summary": "fine", "violations": []},
            {
                "index": 2,
                "verdict": "violated",
                "summary": "nope",
                "violations": [{"file": "a.py", "line": 3, "explanation": "bad"}],
            },
        ]
    )
    parsed = parse_batch_verdicts(text, [1, 2])
    assert parsed is not None and set(parsed) == {1, 2}
    assert parsed[1][0] == "upheld"
    assert parsed[2][2] == [{"file": "a.py", "line": 3, "explanation": "bad"}]


def test_parse_batch_missing_entry_is_absent_not_fatal() -> None:
    text = _batch_result([{"index": 1, "verdict": "upheld", "summary": "ok", "violations": []}])
    parsed = parse_batch_verdicts(text, [1, 2])
    assert parsed is not None and set(parsed) == {1}


def test_parse_batch_ignores_unknown_and_duplicate_indexes() -> None:
    text = _batch_result(
        [
            {"index": 9, "verdict": "violated", "summary": "?", "violations": []},
            {"index": 1, "verdict": "upheld", "summary": "first", "violations": []},
            {"index": 1, "verdict": "violated", "summary": "second", "violations": []},
        ]
    )
    parsed = parse_batch_verdicts(text, [1, 2])
    assert parsed is not None and set(parsed) == {1}
    assert parsed[1][1] == "first"


def test_parse_batch_drops_bad_verdict_entry() -> None:
    text = _batch_result(
        [
            {"index": 1, "verdict": "maybe", "summary": "?", "violations": []},
            {"index": 2, "verdict": "upheld", "summary": "ok", "violations": []},
        ]
    )
    parsed = parse_batch_verdicts(text, [1, 2])
    assert parsed is not None and set(parsed) == {2}


def test_parse_batch_caps_violations() -> None:
    violations = [
        {"file": f"f{i}.py", "line": i, "explanation": "x"}
        for i in range(BATCH_MAX_VIOLATIONS + 5)
    ]
    text = _batch_result(
        [{"index": 1, "verdict": "violated", "summary": "many", "violations": violations}]
    )
    parsed = parse_batch_verdicts(text, [1])
    assert parsed is not None
    assert len(parsed[1][2]) == BATCH_MAX_VIOLATIONS


def test_parse_batch_garbage_is_none() -> None:
    assert parse_batch_verdicts("no json here at all", [1]) is None
    assert parse_batch_verdicts('```json\n{"nope": []}\n```', [1]) is None


def test_parse_batch_unfenced_object_still_parses() -> None:
    entry = {"index": 1, "verdict": "upheld", "summary": "s", "violations": []}
    text = "notes " + json.dumps({"results": [entry]})
    parsed = parse_batch_verdicts(text, [1])
    assert parsed is not None and 1 in parsed


# --- parse_review_batch ------------------------------------------------------------------------


def _review_result(entries: list[dict]) -> str:
    return "panel notes...\n```json\n" + json.dumps({"reviews": entries}) + "\n```"


def test_parse_review_batch_happy_path() -> None:
    text = _review_result(
        [
            {
                "slug": "mr-diff-correctness",
                "headline": "One bug",
                "self_score": 60,
                "comments": [
                    {"severity": "major", "file": "a.py", "line": 3, "body": "off by one"}
                ],
            },
            {"slug": "mr-security-diff", "headline": "Clean", "self_score": 5, "comments": []},
        ]
    )
    parsed = parse_review_batch(text, ["mr-diff-correctness", "mr-security-diff"])
    assert parsed is not None and set(parsed) == {"mr-diff-correctness", "mr-security-diff"}
    assert parsed["mr-diff-correctness"].self_score == 60
    assert parsed["mr-security-diff"].comments == []


def test_parse_review_batch_skipped_and_unknown_slugs() -> None:
    text = _review_result(
        [
            {"slug": "who-dis", "headline": "?", "self_score": 0, "comments": []},
            {"slug": "mr-security-diff", "headline": "Clean", "self_score": 5, "comments": []},
        ]
    )
    parsed = parse_review_batch(text, ["mr-diff-correctness", "mr-security-diff"])
    assert parsed is not None and set(parsed) == {"mr-security-diff"}


def test_parse_review_batch_garbage_is_none() -> None:
    assert parse_review_batch("nothing structured", ["a"]) is None


# --- single-verdict parser regression (refactored through _normalize_verdict) ------------------


def test_parse_verdict_unchanged_shape() -> None:
    text = (
        "```json\n"
        + json.dumps(
            {
                "verdict": "violated",
                "summary": "bad",
                "violations": [{"file": "a.py", "line": None, "explanation": "x"}],
            }
        )
        + "\n```"
    )
    parsed = parse_verdict(text)
    assert parsed == ("violated", "bad", [{"file": "a.py", "line": None, "explanation": "x"}])
    assert parse_verdict("garbage") is None
