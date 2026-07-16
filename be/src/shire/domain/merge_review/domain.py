"""Merge-review domain: value objects, the footprint model, and the deterministic risk formula.

No SQLAlchemy here. A merge review is a mutable snapshot of a local branch-pair analysis: a
git-derived `Footprint` (computed synchronously at create time) plus AI sections — classification,
"overview for humans", and per-hobit reviews — filled in by the background pipeline. Everything in
this module is pure and unit-testable: path heuristics, size classification, and `compute_risk`.
"""

from __future__ import annotations

import re
from enum import StrEnum

from pydantic import BaseModel, field_validator


class SectionStatus(StrEnum):
    """Lifecycle of one analysis section (footprint / classification / overview / hobits / risk)."""

    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"


class MrHobitReviewStatus(StrEnum):
    """Lifecycle of one hobit's review within a merge review (agent statuses mirror hobit runs)."""

    pending = "pending"
    running = "running"
    completed = "completed"
    parse_failed = "parse_failed"
    agent_unavailable = "agent_unavailable"
    timeout = "timeout"
    error = "error"


# Statuses that mean "this review is no longer being worked on" (UI stops polling on these).
TERMINAL_REVIEW_STATUSES = frozenset(
    {
        MrHobitReviewStatus.completed,
        MrHobitReviewStatus.parse_failed,
        MrHobitReviewStatus.agent_unavailable,
        MrHobitReviewStatus.timeout,
        MrHobitReviewStatus.error,
    }
)


class MrSize(StrEnum):
    small = "small"
    medium = "medium"
    large = "large"
    huge = "huge"


class RiskVerdict(StrEnum):
    looks_safe = "looks_safe"
    needs_attention = "needs_attention"
    high_risk = "high_risk"


class MrLabel(StrEnum):
    """The fixed classification vocabulary (multi-label with proportions)."""

    bug_fix = "bug_fix"
    new_feature = "new_feature"
    refactoring = "refactoring"
    docs = "docs"
    tests = "tests"
    chore = "chore"
    config = "config"


class CommentSeverity(StrEnum):
    info = "info"
    minor = "minor"
    major = "major"
    critical = "critical"


class FileFootprint(BaseModel):
    """One changed file — the row behind the stacked bar chart."""

    path: str
    old_path: str | None = None  # set when the file was renamed
    additions: int
    deletions: int
    # Current LOC at the source head; deleted files carry their pre-change LOC (merge-base blob)
    # so the "file size" bar stays meaningful. None only for binary files.
    total_loc: int | None = None
    is_binary: bool = False
    is_new: bool = False
    is_deleted: bool = False
    is_test: bool = False
    is_hotspot: bool = False


class DirectoryFootprint(BaseModel):
    """Directory-level aggregation (first two path segments) — the heatmap row."""

    directory: str  # "." for root-level files
    files_changed: int
    additions: int
    deletions: int


class Footprint(BaseModel):
    """The full git-derived change footprint of a branch pair (merge-base to source head)."""

    merge_base_sha: str
    source_sha: str
    target_sha: str
    commit_count: int
    author_count: int
    authors: list[str]
    files: list[FileFootprint]
    directories: list[DirectoryFootprint]
    total_additions: int
    total_deletions: int
    files_changed: int
    test_files_changed: int
    code_files_changed: int
    test_lines_changed: int
    code_lines_changed: int
    # test lines per code line changed; None when no code lines changed (docs/test-only MR).
    tests_to_code_ratio: float | None
    hotspot_paths_touched: list[str]
    size: MrSize
    efficient: bool


class ClassificationLabel(BaseModel):
    """One label of the multi-label classification, with its rough share of the MR."""

    label: MrLabel
    proportion: float

    @field_validator("proportion", mode="before")
    @classmethod
    def _clamp(cls, value: object) -> float:
        try:
            n = float(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return 0.0
        return max(0.0, min(1.0, n))


class MrComment(BaseModel):
    """One structured comment from a hobit's review of the diff."""

    id: str = ""  # stamped at persist time (stable React key); empty until then
    severity: CommentSeverity
    file: str | None = None
    line: int | None = None
    body: str

    @field_validator("severity", mode="before")
    @classmethod
    def _coerce_severity(cls, value: object) -> object:
        """LLM output is best-effort; unknown severities degrade to info rather than failing."""
        if isinstance(value, str) and value not in CommentSeverity.__members__:
            return CommentSeverity.info
        return value


class MrHobitOutput(BaseModel):
    """The structured result an MR-reviewing hobit must return (parsed from its fenced JSON)."""

    headline: str
    self_score: int
    comments: list[MrComment] = []

    @field_validator("self_score", mode="before")
    @classmethod
    def _clamp(cls, value: object) -> int:
        try:
            n = round(float(value))  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return 0
        return max(0, min(100, n))


class RiskBreakdown(BaseModel):
    """The composite risk score and its components (each 0-100), plus how it was combined."""

    size_score: int
    hotspot_score: int
    test_score: int
    # None when no hobit review completed — the findings term is dropped and the other
    # weights renormalize, so a hobit-less review isn't artificially "safe-looking".
    findings_score: int | None
    total: int
    verdict: RiskVerdict


# --- Size classification (worst axis wins) ---------------------------------------------------
# (max files changed, max changed code lines) per class; beyond the last bound = huge.
_SIZE_BOUNDS: list[tuple[MrSize, int, int]] = [
    (MrSize.small, 5, 100),
    (MrSize.medium, 15, 400),
    (MrSize.large, 40, 1500),
]

_EFFICIENT_SIZES = frozenset({MrSize.small, MrSize.medium})

_TEST_DIR_SEGMENTS = frozenset({"tests", "test", "__tests__", "spec", "specs"})
_TEST_FILE_RE = re.compile(
    r"(^test_[^/]*$)|(_test\.[^./]+$)|(\.test\.[^./]+$)|(\.spec\.[^./]+$)|(^conftest\.py$)"
)

# --- Risk formula constants -------------------------------------------------------------------
_RISK_WEIGHTS = {"size": 0.30, "hotspot": 0.25, "test": 0.20, "findings": 0.25}
_SIZE_RISK = {MrSize.small: 10, MrSize.medium: 35, MrSize.large: 70, MrSize.huge: 95}
_HOTSPOT_POINTS_PER_FILE = 35
_FINDING_POINTS = {
    CommentSeverity.critical: 40,
    CommentSeverity.major: 20,
    CommentSeverity.minor: 6,
    CommentSeverity.info: 1,
}
_VERDICT_NEEDS_ATTENTION_AT = 35
_VERDICT_HIGH_RISK_AT = 65


def is_test_path(path: str) -> bool:
    """Heuristic: does this path look like test code?"""
    parts = path.split("/")
    if any(part in _TEST_DIR_SEGMENTS for part in parts[:-1]):
        return True
    return _TEST_FILE_RE.search(parts[-1]) is not None


def classify_size(files_changed: int, code_lines_changed: int) -> MrSize:
    """Bucket an MR by footprint; the worst of the two axes (files, changed code lines) wins."""
    for size, max_files, max_lines in _SIZE_BOUNDS:
        if files_changed <= max_files and code_lines_changed <= max_lines:
            return size
    return MrSize.huge


def is_efficient(size: MrSize) -> bool:
    """The product's "keep MRs short and focused" flag: small/medium is efficient."""
    return size in _EFFICIENT_SIZES


def compute_risk(footprint: Footprint, comments: list[MrComment] | None) -> RiskBreakdown:
    """Deterministic composite risk. `comments` is every comment from completed hobit reviews;
    pass None when no hobit review completed (the findings term drops and weights renormalize)."""
    size_score = _SIZE_RISK[footprint.size]
    hotspot_score = min(100, _HOTSPOT_POINTS_PER_FILE * len(footprint.hotspot_paths_touched))
    test_score = _test_risk(footprint)

    weights = dict(_RISK_WEIGHTS)
    findings_score: int | None
    if comments is None:
        findings_score = None
        del weights["findings"]
        scale = 1.0 / sum(weights.values())
        weights = {k: v * scale for k, v in weights.items()}
        weighted = (
            weights["size"] * size_score
            + weights["hotspot"] * hotspot_score
            + weights["test"] * test_score
        )
    else:
        findings_score = min(100, sum(_FINDING_POINTS[c.severity] for c in comments))
        weighted = (
            weights["size"] * size_score
            + weights["hotspot"] * hotspot_score
            + weights["test"] * test_score
            + weights["findings"] * findings_score
        )

    total = max(0, min(100, round(weighted)))
    verdict = _verdict_for(total)
    # A confirmed critical finding can never read as "looks safe".
    if (
        verdict is RiskVerdict.looks_safe
        and comments
        and any(c.severity is CommentSeverity.critical for c in comments)
    ):
        verdict = RiskVerdict.needs_attention
    return RiskBreakdown(
        size_score=size_score,
        hotspot_score=hotspot_score,
        test_score=test_score,
        findings_score=findings_score,
        total=total,
        verdict=verdict,
    )


def _test_risk(footprint: Footprint) -> int:
    """Tests-vs-code balance: code changes without accompanying test changes are risky."""
    if footprint.code_lines_changed == 0:
        return 0
    ratio = footprint.test_lines_changed / footprint.code_lines_changed
    if ratio >= 0.5:
        return 0
    if ratio >= 0.2:
        return 30
    if ratio > 0:
        return 65
    return 90


def _verdict_for(total: int) -> RiskVerdict:
    if total >= _VERDICT_HIGH_RISK_AT:
        return RiskVerdict.high_risk
    if total >= _VERDICT_NEEDS_ATTENTION_AT:
        return RiskVerdict.needs_attention
    return RiskVerdict.looks_safe
