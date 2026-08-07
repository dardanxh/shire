"""Tests for the MR-scoped principle check: the diff-scoped prompt and the shared verdict parser.

Pure functions only -- no DB, no engine. The point of these is the *scoping*: the same principle
asked of a whole repository and of one merge request must produce differently-framed prompts, or
the MR verdict reports the repository's pre-existing backlog as if the MR caused it.
"""

from __future__ import annotations

from shire.domain.merge_review.mr_hobit import MrContext, build_principle_check_prompt
from shire.domain.principles.jobs import MAX_VIOLATIONS, parse_verdict

_CTX = MrContext(
    repo_slug="acme/payments",
    source_branch="feat/refunds",
    target_branch="main",
    clone_path="/clones/payments",
    context_markdown="A payments service.",
    footprint_summary="- Size: **medium** — 4 files, +120/-8 lines",
    diff_excerpt="--- a/api/refunds.py\n+++ b/api/refunds.py\n+@router.post('/refunds')\n",
)

_PRINCIPLE = {
    "name": "Every endpoint requires authentication",
    "severity": "critical",
    "statement": "No route may be reachable without an authenticated principal.",
}


def test_prompt_carries_the_diff_and_the_principle() -> None:
    prompt = build_principle_check_prompt(
        _CTX, **_PRINCIPLE, max_violations=MAX_VIOLATIONS
    )

    # The MR orientation, so the model knows which change it is judging.
    assert "acme/payments" in prompt
    assert "feat/refunds" in prompt
    assert "main" in prompt
    assert "@router.post('/refunds')" in prompt
    # The principle itself, verbatim -- the statement is the rule being enforced.
    assert _PRINCIPLE["name"] in prompt
    assert _PRINCIPLE["statement"] in prompt
    assert "critical" in prompt


def test_prompt_scopes_the_verdict_to_the_diff() -> None:
    """The load-bearing difference from the repo-wide audit prompt.

    Without these instructions the auditor answers "does this codebase comply", and every MR
    inherits the blame for violations that predate it.
    """
    prompt = build_principle_check_prompt(
        _CTX, **_PRINCIPLE, max_violations=MAX_VIOLATIONS
    )

    assert "judging the diff, not the repository" in prompt
    assert "not** this MR's fault" in prompt
    assert "Do not \nreport it." in prompt or "Do not report it." in prompt.replace("\n", " ")
    # Not-applicable must resolve to upheld, or unrelated principles read as failures.
    assert "nothing to say about these changes" in prompt
    assert "`upheld`" in prompt
    # Citations must be confined to changed files.
    assert "must be a file this MR changes" in prompt


def test_parses_a_violated_verdict_with_prose_around_it() -> None:
    answer = """\
I read the diff and checked how the other routers declare dependencies.

```json
{
  "verdict": "violated",
  "summary": "The new refunds endpoint is registered without the auth dependency the other \
routers use.",
  "violations": [
    {"file": "api/refunds.py", "line": 12, "explanation": "No Depends(current_principal)."},
    {"file": "api/refunds.py", "line": null, "explanation": "Router omitted from the guard list."}
  ]
}
```"""
    parsed = parse_verdict(answer)

    assert parsed is not None
    verdict, summary, violations = parsed
    assert verdict == "violated"
    assert summary is not None and "auth dependency" in summary
    assert [v["file"] for v in violations] == ["api/refunds.py", "api/refunds.py"]
    assert violations[0]["line"] == 12
    # A null line must survive as None rather than becoming 0 or a string.
    assert violations[1]["line"] is None


def test_parses_an_upheld_verdict_and_drops_junk_violations() -> None:
    answer = """\
```json
{
  "verdict": "upheld",
  "summary": "This change touches only the refund calculator; the principle concerns routing.",
  "violations": [{"line": 4, "explanation": "no file, so unusable"}]
}
```"""
    parsed = parse_verdict(answer)

    assert parsed is not None
    verdict, _, violations = parsed
    assert verdict == "upheld"
    # An entry with no file cannot be shown against a line of code, so it is dropped.
    assert violations == []


def test_rejects_output_with_no_usable_verdict() -> None:
    assert parse_verdict("") is None
    assert parse_verdict("The change looks fine to me.") is None
    # A well-formed object with a verdict outside the vocabulary is not a verdict.
    assert parse_verdict('```json\n{"verdict": "maybe", "summary": "unsure"}\n```') is None


def test_violation_list_is_capped() -> None:
    many = ", ".join(
        f'{{"file": "f{i}.py", "line": {i}, "explanation": "x"}}' for i in range(MAX_VIOLATIONS + 8)
    )
    parsed = parse_verdict(
        f'```json\n{{"verdict": "violated", "summary": "s", "violations": [{many}]}}\n```'
    )

    assert parsed is not None
    assert len(parsed[2]) == MAX_VIOLATIONS
