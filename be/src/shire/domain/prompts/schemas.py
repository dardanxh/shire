"""Pydantic schemas for the prompts domain."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from shire.domain.prompts import analysis
from shire.domain.prompts.analysis import Finding, StaticAnalysis
from shire.domain.prompts.domain import Tuning, VersionSource
from shire.domain.prompts.models import (
    PromptJudgementRow,
    PromptReviewRow,
    PromptRow,
    PromptRunRow,
    PromptSuggestionRow,
    PromptVersionRow,
)


class AnalyzePrompt(BaseModel):
    """Score a body without storing anything -- powers the live editor feedback."""

    body: str = Field(max_length=400_000)


class CreatePrompt(BaseModel):
    """A new prompt. The body becomes version 1."""

    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4_000)
    tags: list[str] = Field(default_factory=list)
    body: str = Field(min_length=1, max_length=400_000)
    guidance: str | None = Field(default=None, max_length=20_000)
    tuning: Tuning = Field(default_factory=Tuning)


class UpdatePrompt(BaseModel):
    """Library metadata only. The text is immutable -- edits create a version."""

    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4_000)
    tags: list[str] = Field(default_factory=list)


class CreatePromptVersion(BaseModel):
    """Append a version. `source` records whether a human or the model wrote the body."""

    body: str = Field(min_length=1, max_length=400_000)
    guidance: str | None = Field(default=None, max_length=20_000)
    tuning: Tuning = Field(default_factory=Tuning)
    source: VersionSource = VersionSource.manual
    note: str | None = Field(default=None, max_length=1_000)
    # Set when the body was merged (wholly or partly) from a suggestion, so the effect of accepting
    # the model's rewrite stays measurable.
    from_suggestion_id: uuid.UUID | None = None


class RequestSuggestion(BaseModel):
    """Ask the model to rewrite a version.

    Tuning and guidance are supplied per request rather than read off the version, so the panel can
    try a different voice without first saving a version nobody wanted.
    """

    tuning: Tuning = Field(default_factory=Tuning)
    guidance: str | None = Field(default=None, max_length=20_000)


class ReviewFinding(BaseModel):
    """One thing the reviewing model would change. Distinct from `analysis.Finding`, which is
    mechanical -- this is a judgement, and the UI keeps the two visually apart."""

    dimension: str
    severity: str
    title: str
    detail: str
    evidence: str | None


class PromptReviewResult(BaseModel):
    """One AI metrics pass. Scores are 0-100; `hallucination_risk` is the one where high is bad."""

    id: uuid.UUID
    version_id: uuid.UUID
    job_id: uuid.UUID | None
    status: str
    model: str
    clarity: int | None
    specificity: int | None
    structure: int | None
    context_sufficiency: int | None
    factfulness: int | None
    accuracy: int | None
    goal_focus: int | None
    hallucination_risk: int | None
    size_verdict: str | None
    goal_count: int | None
    summary: str | None
    findings: list[ReviewFinding]
    error: str | None
    duration_seconds: float | None
    created_at: datetime
    finished_at: datetime | None

    @classmethod
    def of(cls, row: PromptReviewRow) -> PromptReviewResult:
        return cls(
            id=row.id,
            version_id=row.version_id,
            job_id=row.job_id,
            status=row.status,
            model=row.model,
            clarity=row.clarity,
            specificity=row.specificity,
            structure=row.structure,
            context_sufficiency=row.context_sufficiency,
            factfulness=row.factfulness,
            accuracy=row.accuracy,
            goal_focus=row.goal_focus,
            hallucination_risk=row.hallucination_risk,
            size_verdict=row.size_verdict,
            goal_count=row.goal_count,
            summary=row.summary,
            findings=[ReviewFinding.model_validate(f) for f in row.findings or []],
            error=row.error,
            duration_seconds=row.duration_seconds,
            created_at=row.created_at,
            finished_at=row.finished_at,
        )


class SuggestionChange(BaseModel):
    """One of the model's notes on what it changed. Explanatory, not an applicable patch."""

    title: str
    rationale: str
    dimension: str


class PromptSuggestionResult(BaseModel):
    id: uuid.UUID
    version_id: uuid.UUID
    job_id: uuid.UUID | None
    status: str
    model: str
    rewritten_body: str | None
    changes: list[SuggestionChange]
    summary: str | None
    error: str | None
    duration_seconds: float | None
    created_at: datetime
    finished_at: datetime | None

    @classmethod
    def of(cls, row: PromptSuggestionRow) -> PromptSuggestionResult:
        return cls(
            id=row.id,
            version_id=row.version_id,
            job_id=row.job_id,
            status=row.status,
            model=row.model,
            rewritten_body=row.rewritten_body,
            changes=[SuggestionChange.model_validate(c) for c in row.changes or []],
            summary=row.summary,
            error=row.error,
            duration_seconds=row.duration_seconds,
            created_at=row.created_at,
            finished_at=row.finished_at,
        )


class StartArenaRun(BaseModel):
    """Run one version against several models at once.

    `judge` defaults on: comparing outputs by eye is the tedious part, and the judge is one extra
    call on top of N runs that already happened.
    """

    models: list[str] = Field(min_length=1, max_length=6)
    system: str | None = Field(default=None, max_length=20_000)
    variables: dict[str, str] | None = None
    judge: bool = True
    judge_model: str | None = None


class PromptRunResult(BaseModel):
    """One execution. Token counts and cost here are *measured*, unlike the version's estimate."""

    id: uuid.UUID
    version_id: uuid.UUID
    batch_id: uuid.UUID
    job_id: uuid.UUID | None
    model: str
    status: str
    output: str | None
    input_tokens: int | None
    output_tokens: int | None
    cache_read_input_tokens: int | None
    cache_creation_input_tokens: int | None
    total_cost_usd: float | None
    num_turns: int | None
    duration_seconds: float | None
    error: str | None
    created_at: datetime
    finished_at: datetime | None

    @classmethod
    def of(cls, row: PromptRunRow) -> PromptRunResult:
        return cls(
            id=row.id,
            version_id=row.version_id,
            batch_id=row.batch_id,
            job_id=row.job_id,
            model=row.model,
            status=row.status,
            output=row.output,
            input_tokens=row.input_tokens,
            output_tokens=row.output_tokens,
            cache_read_input_tokens=row.cache_read_input_tokens,
            cache_creation_input_tokens=row.cache_creation_input_tokens,
            total_cost_usd=row.total_cost_usd,
            num_turns=row.num_turns,
            duration_seconds=row.duration_seconds,
            error=row.error,
            created_at=row.created_at,
            finished_at=row.finished_at,
        )


class JudgeScore(BaseModel):
    run_id: uuid.UUID
    faithfulness: int | None
    completeness: int | None
    instruction_adherence: int | None
    groundedness: int | None
    overall: int | None
    rationale: str


class PromptJudgementResult(BaseModel):
    id: uuid.UUID
    version_id: uuid.UUID
    batch_id: uuid.UUID
    job_id: uuid.UUID | None
    status: str
    model: str
    scores: list[JudgeScore]
    winner_run_id: uuid.UUID | None
    summary: str | None
    error: str | None
    duration_seconds: float | None
    created_at: datetime
    finished_at: datetime | None

    @classmethod
    def of(cls, row: PromptJudgementRow) -> PromptJudgementResult:
        return cls(
            id=row.id,
            version_id=row.version_id,
            batch_id=row.batch_id,
            job_id=row.job_id,
            status=row.status,
            model=row.model,
            scores=[JudgeScore.model_validate(s) for s in row.scores or []],
            winner_run_id=row.winner_run_id,
            summary=row.summary,
            error=row.error,
            duration_seconds=row.duration_seconds,
            created_at=row.created_at,
            finished_at=row.finished_at,
        )


class ArenaBatchResult(BaseModel):
    """One "test across these models" action: its runs and the judge's verdict on them."""

    batch_id: uuid.UUID
    runs: list[PromptRunResult]
    judgement: PromptJudgementResult | None
    created_at: datetime


class PromptMetricPoint(BaseModel):
    """One version's numbers, for the trend chart. Every field is nullable except the version
    identity: a version that was never reviewed or never run still belongs on the x-axis, as a gap
    rather than a zero."""

    version_id: uuid.UUID
    number: int
    created_at: datetime
    source: str
    estimated_input_tokens: int
    static_score: int
    # Latest settled AI review for this version, if any.
    review_model: str | None
    clarity: int | None
    specificity: int | None
    structure: int | None
    context_sufficiency: int | None
    factfulness: int | None
    accuracy: int | None
    goal_focus: int | None
    hallucination_risk: int | None
    # Measured from real arena runs -- means across every settled run. This is the *whole* input
    # the call billed (uncached + cache write + cache read), which includes the CLI's own harness
    # overhead, so it is not comparable to `estimated_input_tokens`.
    measured_input_tokens: int | None
    measured_output_tokens: int | None
    total_cost_usd: float | None
    run_count: int
    # Mean `overall` the judge gave this version's answers.
    judge_overall: int | None


class PromptMetricsResult(BaseModel):
    """The whole trend, oldest version first.

    Deliberately carries no "estimator accuracy" figure. It looks derivable -- measured tokens over
    estimated tokens -- but is not: the CLI's usage covers its own system prompt and tool
    definitions as well as the prompt under test, so the ratio would compare two different things
    and read as a wild estimator error (5% on a real measurement) rather than as overhead.
    """

    prompt_id: uuid.UUID
    points: list[PromptMetricPoint]


class PromptVersionResult(BaseModel):
    """A version without its findings -- the shape the version table and trend chart read."""

    id: uuid.UUID
    prompt_id: uuid.UUID
    number: int
    body: str
    guidance: str | None
    tuning: Tuning
    source: str
    note: str | None
    estimated_input_tokens: int
    static_score: int
    size_verdict: str
    created_at: datetime

    @classmethod
    def of(cls, row: PromptVersionRow) -> PromptVersionResult:
        return cls(
            id=row.id,
            prompt_id=row.prompt_id,
            number=row.number,
            body=row.body,
            guidance=row.guidance,
            tuning=Tuning.model_validate(row.tuning or {}),
            source=row.source,
            note=row.note,
            estimated_input_tokens=row.estimated_input_tokens,
            static_score=row.static_score,
            size_verdict=analysis.size_verdict(row.estimated_input_tokens),
            created_at=row.created_at,
        )


class PromptVersionDetailResult(PromptVersionResult):
    """A version plus the deterministic findings and every async artefact hanging off it."""

    findings: list[Finding]
    suggestions: list[PromptSuggestionResult]
    reviews: list[PromptReviewResult]
    batches: list[ArenaBatchResult]

    @classmethod
    def of_detail(
        cls,
        row: PromptVersionRow,
        *,
        suggestions: list[PromptSuggestionRow] | None = None,
        reviews: list[PromptReviewRow] | None = None,
        batches: list[ArenaBatchResult] | None = None,
    ) -> PromptVersionDetailResult:
        base = PromptVersionResult.of(row)
        return cls(
            **base.model_dump(),
            findings=[Finding.model_validate(f) for f in row.static_findings or []],
            suggestions=[PromptSuggestionResult.of(s) for s in suggestions or []],
            reviews=[PromptReviewResult.of(r) for r in reviews or []],
            batches=list(batches or []),
        )


class PromptResult(BaseModel):
    """A library row. Carries the current version's headline numbers so the list needs no joins,
    plus the score of every version so the table can draw a sparkline."""

    id: uuid.UUID
    name: str
    description: str | None
    tags: list[str]
    current_version_id: uuid.UUID | None
    current_version_number: int | None
    version_count: int
    static_score: int | None
    estimated_input_tokens: int | None
    score_history: list[int]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def of(
        cls,
        row: PromptRow,
        *,
        current: PromptVersionRow | None,
        version_count: int,
        score_history: list[int],
    ) -> PromptResult:
        return cls(
            id=row.id,
            name=row.name,
            description=row.description,
            tags=list(row.tags or []),
            current_version_id=row.current_version_id,
            current_version_number=current.number if current else None,
            version_count=version_count,
            static_score=current.static_score if current else None,
            estimated_input_tokens=current.estimated_input_tokens if current else None,
            score_history=score_history,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )


class PromptDetailResult(PromptResult):
    """What the workbench opens on: the library row, the current version in full, and the version
    list for the picker."""

    current_version: PromptVersionDetailResult | None
    versions: list[PromptVersionResult]

    @classmethod
    def of_detail(
        cls,
        row: PromptRow,
        *,
        current: PromptVersionRow | None,
        versions: list[PromptVersionRow],
        score_history: list[int],
        suggestions: list[PromptSuggestionRow] | None = None,
        reviews: list[PromptReviewRow] | None = None,
        batches: list[ArenaBatchResult] | None = None,
    ) -> PromptDetailResult:
        base = PromptResult.of(
            row, current=current, version_count=len(versions), score_history=score_history
        )
        return cls(
            **base.model_dump(),
            current_version=(
                PromptVersionDetailResult.of_detail(
                    current,
                    suggestions=suggestions,
                    reviews=reviews,
                    batches=batches,
                )
                if current is not None
                else None
            ),
            versions=[PromptVersionResult.of(v) for v in versions],
        )


class EnqueuedResult(BaseModel):
    """202 body for the async actions: the artefact row plus the engine job driving it."""

    job_id: uuid.UUID | None
    artefact_id: uuid.UUID


__all__ = [
    "AnalyzePrompt",
    "CreatePrompt",
    "CreatePromptVersion",
    "EnqueuedResult",
    "PromptDetailResult",
    "PromptJudgementResult",
    "PromptMetricsResult",
    "PromptResult",
    "PromptReviewResult",
    "PromptRunResult",
    "PromptSuggestionResult",
    "PromptVersionDetailResult",
    "PromptVersionResult",
    "RequestSuggestion",
    "StartArenaRun",
    "StaticAnalysis",
    "UpdatePrompt",
]
