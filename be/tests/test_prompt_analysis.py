"""Tests for the deterministic prompt rule pack and the token estimator.

Two properties matter more than any individual rule:

1. A deliberately dated prompt fires the rules that describe it, with usable evidence.
2. A well-written prompt scores clean. A rule pack that flags everything is worse than none, so the
   keep-list guards (a reason next to a prohibition, word-count floors) get their own tests.
"""

from __future__ import annotations

from shire.domain.prompts.analysis import analyse, estimate_tokens, size_verdict

# A prompt carrying most of the anti-patterns at once: shouted emphasis, dated scaffolding, a
# retired model, step choreography, an unexplained prohibition run, a placeholder, and a word cap.
_DATED_PROMPT = """\
You are a helpful assistant. CRITICAL: You MUST follow these rules. IMPORTANT: NEVER deviate.

Think step by step before answering. Use the <scratchpad> to plan.
This is tuned for claude-3 and relies on temperature 0.

STEP 1: Read the input.
STEP 2: Extract the fields.
STEP 3: Emit the result.

Do not use bullet points
Do not include headings
Never apologise
Avoid hedging

Summarise the text in at most 120 words for [INSERT AUDIENCE].
"""

# The same underlying task, written the way the audit guidance recommends: reasoned constraints,
# stated audience and purpose, an explicit output shape with an example.
_GOOD_PROMPT = """\
Summarise a customer support thread for the engineer who will pick it up next.

They need to know what the customer wants and what has already been tried, so they do not repeat
work or ask the customer something that was answered upstream.

Skip internal ticket ids, because the engineer cannot resolve them and they crowd out the story.

Return two sections:

## What they want
One or two sentences.

## Already tried
A short list, most recent first. For example:

- Cleared the local cache; the error persisted.
- Reinstalled the agent on 2 machines; one recovered.
"""


def _rule_ids(body: str) -> set[str]:
    return {finding.rule_id for finding in analyse(body).findings}


def test_dated_prompt_fires_the_rules_that_describe_it() -> None:
    fired = _rule_ids(_DATED_PROMPT)
    expected = {
        "pressure_language",
        "dated_scaffold",
        "deprecated_parameter",
        "retired_model_reference",
        "step_choreography",
        "prohibition_pileup",
        "unresolved_placeholder",
        "numeric_output_clamp",
    }
    assert expected <= fired, f"missing: {sorted(expected - fired)}"


def test_dated_prompt_scores_far_below_a_good_one() -> None:
    """The score has to separate the two by a wide margin or it is decoration, not a signal."""
    dated = analyse(_DATED_PROMPT).score
    good = analyse(_GOOD_PROMPT).score
    assert dated < 35
    assert good >= 90
    assert good - dated >= 55


def test_good_prompt_scores_clean() -> None:
    """The keep-list in action: reasoned constraints, an audience and an example are not defects."""
    verdict = analyse(_GOOD_PROMPT)
    blockers = [f for f in verdict.findings if f.severity in ("blocker", "warn")]
    assert blockers == [], [f.rule_id for f in blockers]
    assert verdict.size_verdict == "right"


def test_findings_carry_evidence_and_a_reason() -> None:
    """Every finding must be explainable in the UI without the user reading the rule source."""
    for finding in analyse(_DATED_PROMPT).findings:
        assert finding.title
        assert finding.detail
        assert finding.why_it_matters
        assert finding.severity in ("blocker", "warn", "info")


def test_prohibitions_with_a_reason_are_not_flagged() -> None:
    """A reasoned constraint is the content a good prompt has -- the pile-up rule must skip it."""
    reasoned = (
        "Summarise the incident for the on-call engineer.\n"
        "Do not include customer names, because the summary is posted to a shared channel.\n"
        "Do not speculate about root cause, since that is the retro's job.\n"
        "Never page a second team, otherwise you get duplicated effort.\n"
        "Return a short paragraph followed by a bulleted timeline.\n"
    )
    assert "prohibition_pileup" not in _rule_ids(reasoned)


def test_unreasoned_prohibition_run_is_flagged() -> None:
    unreasoned = (
        "Write release notes for the changelog readers.\n"
        "Do not use emoji\n"
        "Do not use headings\n"
        "Never mention internal tooling\n"
        "Return one paragraph per change.\n"
    )
    assert "prohibition_pileup" in _rule_ids(unreasoned)


def test_short_role_line_alone_is_flagged_but_a_long_prompt_is_not() -> None:
    """`identity_stub_only` fires when the persona *replaces* context, not whenever one exists."""
    assert "identity_stub_only" in _rule_ids("You are a helpful assistant. Answer questions.")
    assert "identity_stub_only" not in _rule_ids(_GOOD_PROMPT)


def test_template_variables_are_information_not_a_defect() -> None:
    body = (
        "Summarise {{document}} for {{audience}} so they can decide whether to read the full "
        "text. Return three bullet points, each one sentence long, in markdown."
    )
    findings = {f.rule_id: f for f in analyse(body).findings}
    assert findings["template_variable"].severity == "info"
    assert "unresolved_placeholder" not in findings


def test_blank_and_trivial_prompts_report_no_substance() -> None:
    assert "no_substance" in _rule_ids("do it")
    assert analyse("").score < 100


def test_repetition_detects_a_restated_instruction() -> None:
    body = (
        "Summarise the article for a busy executive reader in plain language.\n"
        "Return three bullets in markdown.\n"
        "Summarise the article for a busy executive reader using plain language.\n"
    )
    assert "repetition" in _rule_ids(body)


def test_volatile_content_near_the_top_is_flagged_for_caching() -> None:
    body = (
        "Today's date is 2026-08-06. You are reviewing a pull request for the platform team so "
        "they can merge with confidence. Return a markdown list of concerns, most serious first.\n"
    )
    assert "cache_hostile_volatility" in _rule_ids(body)


def test_goal_count_counts_distinct_asks() -> None:
    body = (
        "Summarise the document. Translate the summary into German. Classify the sentiment. "
        "Extract every date mentioned. Return markdown.\n"
    )
    verdict = analyse(body)
    assert verdict.goal_count >= 4
    assert "multi_goal" in {f.rule_id for f in verdict.findings}


def test_estimate_tokens_lands_in_the_english_chars_per_token_regime() -> None:
    """Calibration, not exactness.

    English text really does tokenize at roughly 4 characters per token, so asserting the ratio is
    a property we can check offline -- unlike an exact count, which needs the tokenizer we do not
    have. The band is deliberately wide at the punctuation-heavy end.
    """
    assert estimate_tokens("") == 0
    # 9 short words and a period; a real tokenizer puts this at about 10.
    assert 8 <= estimate_tokens("The quick brown fox jumps over the lazy dog.") <= 12

    prose = (
        "Summarise the support thread for the engineer who picks it up next. They need to know "
        "what the customer wants and what has already been tried, so they do not repeat work."
    )
    ratio = len(prose) / estimate_tokens(prose)
    assert 3.4 <= ratio <= 4.8, f"prose at {ratio:.2f} chars/token is outside the English regime"

    # JSON is punctuation-dense and legitimately tokenizes closer to 2.5-3 chars per token.
    payload = '{"name": "value", "count": 42, "items": ["a", "b", "c"], "nested": {"k": true}}'
    json_ratio = len(payload) / estimate_tokens(payload)
    assert 2.0 <= json_ratio <= 3.6, f"json at {json_ratio:.2f} chars/token"


def test_estimate_tokens_grows_monotonically_with_length() -> None:
    short = "Summarise this."
    assert estimate_tokens(short) < estimate_tokens(short * 5)


def test_size_verdict_buckets() -> None:
    assert size_verdict(10) == "too_small"
    assert size_verdict(500) == "right"
    assert size_verdict(50_000) == "too_big"


def test_analysis_is_deterministic() -> None:
    """Same input, same verdict -- the whole point of keeping this pass free of the model."""
    first = analyse(_DATED_PROMPT)
    second = analyse(_DATED_PROMPT)
    assert first.model_dump() == second.model_dump()
