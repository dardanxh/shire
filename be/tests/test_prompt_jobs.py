"""Tests for the prompt-workbench prompt builders and output parsers.

Pure functions only -- no DB, no engine. The agent answers below are deliberately messy (prose
around the JSON, an out-of-vocabulary dimension, a change with no title) because that is what real
model output looks like, and a parser that only handles the clean case fails in production.
"""

from __future__ import annotations

import uuid

from shire.domain.prompts.domain import Archetype, OutputFormat, Tuning
from shire.domain.prompts.jobs import (
    REVIEW_DIMENSIONS,
    build_judge_prompt,
    build_review_prompt,
    build_suggest_prompt,
    parse_judgement,
    parse_review,
    parse_suggestion,
    substitute_variables,
)
from shire.domain.prompts.models import PromptRunRow, PromptVersionRow

_SUGGEST_ANSWER = """\
I read the prompt and found the emphasis was doing more harm than good. Here is my rewrite.

```json
{
  "summary": "Dropped the shouted directives, named the audience, and added an output shape.",
  "rewritten_body": "Summarise the support thread for the next engineer.\\n\\nReturn two sections.",
  "changes": [
    {
      "title": "Removed shouted emphasis",
      "rationale": "Current models follow plain instructions.",
      "dimension": "emphasis"
    },
    {
      "title": "Named the audience",
      "rationale": "Lets the model make the calls you did not spell out.",
      "dimension": "substance"
    },
    {"title": "Bad dimension", "rationale": "Should fall back.", "dimension": "vibes"},
    {"rationale": "No title, should be dropped.", "dimension": "clarity"}
  ]
}
```
"""


def _version(body: str, *, tuning: Tuning | None = None, guidance: str | None = None):
    """A detached row -- the builders only read attributes, so no session is needed."""
    return PromptVersionRow(
        body=body,
        guidance=guidance,
        tuning=(tuning or Tuning()).model_dump(mode="json"),
    )


# --- parse_suggestion -------------------------------------------------------------------------


def test_parse_suggestion_reads_the_fenced_block_past_the_prose() -> None:
    parsed = parse_suggestion(_SUGGEST_ANSWER)

    assert parsed is not None
    assert parsed["summary"].startswith("Dropped the shouted")
    assert "Summarise the support thread" in parsed["rewritten_body"]


def test_parse_suggestion_keeps_titled_changes_and_drops_the_rest() -> None:
    parsed = parse_suggestion(_SUGGEST_ANSWER)

    assert parsed is not None
    titles = [change["title"] for change in parsed["changes"]]
    assert titles == ["Removed shouted emphasis", "Named the audience", "Bad dimension"]


def test_parse_suggestion_falls_back_on_an_unknown_dimension() -> None:
    """An out-of-vocabulary dimension must not reach the UI's chip palette."""
    parsed = parse_suggestion(_SUGGEST_ANSWER)

    assert parsed is not None
    assert parsed["changes"][2]["dimension"] == "clarity"


def test_parse_suggestion_rejects_output_with_no_rewritten_body() -> None:
    """Change notes without a new prompt give the user nothing to preview, so it is a failure."""
    no_body = '```json\n{"summary": "I thought about it", "changes": []}\n```'
    assert parse_suggestion(no_body) is None
    assert parse_suggestion('```json\n{"rewritten_body": "   "}\n```') is None


def test_parse_suggestion_rejects_unusable_output() -> None:
    assert parse_suggestion("") is None
    assert parse_suggestion("I could not do this.") is None
    assert parse_suggestion("```json\n{not json at all}\n```") is None


# --- build_suggest_prompt ---------------------------------------------------------------------


def test_suggest_prompt_hands_the_static_findings_to_the_model() -> None:
    """The point of running the free rule pack first: the rewrite starts from named defects."""
    body = "You are a helpful assistant. CRITICAL: You MUST comply. IMPORTANT: NEVER deviate."
    built = build_suggest_prompt(_version(body))

    assert "Shouted emphasis" in built
    assert "Treat these as verified" in built


def test_suggest_prompt_says_so_when_the_checks_are_clean() -> None:
    body = (
        "Summarise the support thread for the engineer picking it up next, because they need to "
        "know what has been tried. Return two markdown sections. For example: ## What they want"
    )
    built = build_suggest_prompt(_version(body))

    assert "the static checks are clean" in built.lower()


def test_suggest_prompt_only_mentions_knobs_that_were_moved() -> None:
    """A wall of "3 out of 5, do nothing" would drown the constraints that do matter."""
    neutral = build_suggest_prompt(_version("Summarise the thread for the on-call engineer."))
    assert "Criticality" not in neutral
    assert "Verbosity" not in neutral

    tuned = build_suggest_prompt(
        _version(
            "Summarise the thread for the on-call engineer.",
            tuning=Tuning(criticality=5, verbosity=1, sensitivity=5),
        )
    )
    assert "Criticality 5/5" in tuned
    assert "Verbosity 1/5" in tuned
    assert "Sensitivity 5/5" in tuned


def test_suggest_prompt_carries_archetype_keywords_audience_and_disclaimer() -> None:
    built = build_suggest_prompt(
        _version(
            "Summarise the thread.",
            tuning=Tuning(
                archetype=Archetype.aggressive,
                output_format=OutputFormat.json,
                keywords=["SLA", "escalation"],
                audience="the on-call engineer",
                disclaimer=True,
                disclaimer_text="note that this is not legal advice",
            ),
            guidance="Make it sharper",
        )
    )

    assert "forceful" in built
    assert "single JSON object" in built
    assert "`SLA`" in built and "`escalation`" in built
    assert "the on-call engineer" in built
    assert "not legal advice" in built
    assert "Make it sharper" in built


_REVIEW_ANSWER = """\
I read the prompt closely. Here is my assessment.

```json
{
  "summary": "Workable but under-specified: the task is clear, the output shape is not.",
  "scores": {
    "clarity": 72, "specificity": 40, "structure": 55, "context_sufficiency": 35,
    "factfulness": 80, "accuracy": 60, "goal_focus": 90, "hallucination_risk": 65
  },
  "size_verdict": "too_small",
  "goal_count": 1,
  "findings": [
    {
      "dimension": "context_sufficiency",
      "severity": "high",
      "title": "No audience named",
      "detail": "Say who reads the output so the model can pitch it.",
      "evidence": "Summarise the thread."
    },
    {
      "dimension": "not_a_dimension",
      "severity": "catastrophic",
      "title": "Out-of-vocabulary values fall back",
      "detail": "Both the dimension and the severity are invented.",
      "evidence": null
    },
    {"dimension": "clarity", "severity": "low", "detail": "No title, dropped."}
  ]
}
```
"""


def test_parse_review_reads_all_eight_scores() -> None:
    parsed = parse_review(_REVIEW_ANSWER)

    assert parsed is not None
    assert set(parsed["scores"]) == set(REVIEW_DIMENSIONS)
    assert parsed["scores"]["specificity"] == 40
    assert parsed["scores"]["hallucination_risk"] == 65
    assert parsed["size_verdict"] == "too_small"
    assert parsed["goal_count"] == 1


def test_parse_review_clamps_out_of_range_scores() -> None:
    """A model that answers 150 or -20 must not put an impossible point on the trend chart."""
    answer = (
        '```json\n{"scores": {"clarity": 150, "specificity": -20, "structure": 55, '
        '"context_sufficiency": 50, "factfulness": 50, "accuracy": 50, "goal_focus": 50, '
        '"hallucination_risk": 50}}\n```'
    )
    parsed = parse_review(answer)

    assert parsed is not None
    assert parsed["scores"]["clarity"] == 100
    assert parsed["scores"]["specificity"] == 0


def test_parse_review_falls_back_on_unknown_dimension_and_severity() -> None:
    parsed = parse_review(_REVIEW_ANSWER)

    assert parsed is not None
    second = parsed["findings"][1]
    assert second["dimension"] == "clarity"
    assert second["severity"] == "medium"


def test_parse_review_drops_untitled_findings() -> None:
    parsed = parse_review(_REVIEW_ANSWER)

    assert parsed is not None
    assert len(parsed["findings"]) == 2


def test_parse_review_rejects_output_with_no_usable_scores() -> None:
    """Scores are the only reason this job exists; prose alone cannot move a trend line."""
    assert parse_review('```json\n{"summary": "Looks fine to me", "findings": []}\n```') is None
    no_numbers = '```json\n{"scores": {"clarity": "high", "specificity": null}}\n```'
    assert parse_review(no_numbers) is None


def test_parse_review_rejects_unusable_output() -> None:
    assert parse_review("") is None
    assert parse_review("I would rather not.") is None


def test_review_prompt_hands_over_findings_and_asks_for_calibration() -> None:
    # Needs 3+ shouted directives for `pressure_language` to fire -- one CRITICAL is below the bar.
    body = "You are a helpful assistant. CRITICAL: You MUST comply. IMPORTANT: NEVER deviate."
    built = build_review_prompt(_version(body))

    assert "Shouted emphasis" in built
    assert "Do not repeat them" in built
    # Without a calibration anchor models cluster every score in the 70-85 band, which makes the
    # trend chart useless.
    assert "calibrated critic" in built
    for dimension in REVIEW_DIMENSIONS:
        assert dimension in built


def test_review_prompt_says_higher_is_worse_for_hallucination_risk() -> None:
    """The one inverted dimension. If the model scores it like the others the chart lies."""
    built = build_review_prompt(_version("Summarise the thread."))

    assert "higher is \\\n**worse**" in built or "higher is" in built
    assert "worse" in built


def test_suggest_prompt_protects_context_from_being_stripped() -> None:
    """The rewrite must be told that reasons and audience are content, not clutter -- that is the
    most common way an automated rewrite makes a prompt worse."""
    built = build_suggest_prompt(_version("Summarise the thread."))

    assert "only the author could know" in built
    assert "Length is not a defect" in built


# --- arena: variable substitution ---------------------------------------------------------------


def test_substitute_variables_fills_known_placeholders() -> None:
    body = "Summarise {{document}} for {{audience}}."
    filled = substitute_variables(body, {"document": "the thread", "audience": "on-call"})

    assert filled == "Summarise the thread for on-call."


def test_substitute_variables_tolerates_whitespace_in_the_braces() -> None:
    assert substitute_variables("Hi {{ name }}", {"name": "Ada"}) == "Hi Ada"


def test_substitute_variables_leaves_unknown_placeholders_visible() -> None:
    """Blanking an unfilled variable would hide the mistake: the run would test a prompt with a
    hole in it and the bad output would look like a model failure."""
    assert substitute_variables("Hi {{name}}", {"other": "x"}) == "Hi {{name}}"


def test_substitute_variables_is_a_noop_without_variables() -> None:
    assert substitute_variables("Hi {{name}}", None) == "Hi {{name}}"
    assert substitute_variables("Hi {{name}}", {}) == "Hi {{name}}"


# --- arena: judge parsing -----------------------------------------------------------------------

_RUN_A = "11111111-1111-1111-1111-111111111111"
_RUN_B = "22222222-2222-2222-2222-222222222222"

_JUDGE_ANSWER = """\
Both answers were decent. Here is my verdict.

```json
{
  "summary": "A followed the format; B invented a section that was never asked for.",
  "winner_run_id": "11111111-1111-1111-1111-111111111111",
  "scores": [
    {
      "run_id": "11111111-1111-1111-1111-111111111111",
      "faithfulness": 88, "completeness": 82, "instruction_adherence": 91,
      "groundedness": 90, "overall": 87, "rationale": "Followed the template exactly."
    },
    {
      "run_id": "22222222-2222-2222-2222-222222222222",
      "faithfulness": 60, "completeness": 70, "instruction_adherence": 45,
      "groundedness": 55, "overall": 58, "rationale": "Added an unrequested section."
    },
    {
      "run_id": "99999999-9999-9999-9999-999999999999",
      "faithfulness": 10, "completeness": 10, "instruction_adherence": 10,
      "groundedness": 10, "overall": 10, "rationale": "This run never existed."
    }
  ]
}
```
"""


def test_parse_judgement_keeps_only_runs_that_were_actually_judged() -> None:
    """A hallucinated run_id must not attach scores to a run the arena never started."""
    parsed = parse_judgement(_JUDGE_ANSWER, {_RUN_A, _RUN_B})

    assert parsed is not None
    assert [s["run_id"] for s in parsed["scores"]] == [_RUN_A, _RUN_B]
    assert parsed["winner_run_id"] == _RUN_A
    assert parsed["scores"][0]["instruction_adherence"] == 91


def test_parse_judgement_falls_back_to_the_top_score_when_the_winner_is_bogus() -> None:
    """The scores are the valuable part; a bad winner is a presentation gap, not a failure."""
    answer = _JUDGE_ANSWER.replace(
        '"winner_run_id": "11111111-1111-1111-1111-111111111111"',
        '"winner_run_id": "not-a-run"',
    )
    parsed = parse_judgement(answer, {_RUN_A, _RUN_B})

    assert parsed is not None
    assert parsed["winner_run_id"] == _RUN_A  # highest `overall` of the two real runs


def test_parse_judgement_rejects_a_verdict_about_no_known_run() -> None:
    assert parse_judgement(_JUDGE_ANSWER, {"33333333-3333-3333-3333-333333333333"}) is None


def test_parse_judgement_rejects_unusable_output() -> None:
    assert parse_judgement("", {_RUN_A}) is None
    assert parse_judgement("I decline to judge.", {_RUN_A}) is None


def test_judge_prompt_is_neutral_and_labels_each_answer_with_its_run_id() -> None:
    version = _version("Summarise the thread for the on-call engineer.")
    runs = [
        PromptRunRow(id=uuid.UUID(_RUN_A), model="opus", output="Answer from opus."),
        PromptRunRow(id=uuid.UUID(_RUN_B), model="haiku", output="Answer from haiku."),
    ]
    built = build_judge_prompt(version, runs)

    assert "You are neutral" in built
    # The run_id has to be echoable, or the scores cannot be matched back to a run.
    assert _RUN_A in built and _RUN_B in built
    assert "Answer from opus." in built and "Answer from haiku." in built
    # Judging the prompt instead of the answers is the classic failure mode here.
    assert "Judge the answers, not the prompt" in built
    # Without this, judges cluster every answer within a few points of each other.
    assert "Spread your scores" in built
