"""Prompt-engineering domain types: lifecycles and the tuning value object.

No SQLAlchemy here. `Tuning` is the validated shape of the `prompt_versions.tuning` JSONB column --
the knobs the user turns before asking Claude to rewrite a prompt. It is snapshotted per version so
a version records not just the text but the intent that produced it.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field, field_validator


class VersionSource(StrEnum):
    """Where a version's body came from."""

    manual = "manual"
    ai_rewrite = "ai_rewrite"
    suggestion_merge = "suggestion_merge"


class WorkStatus(StrEnum):
    """Lifecycle shared by the four async artefacts (review, suggestion, run, judgement).

    Distinct from `jobs.status`: the engine's job can succeed while the artefact still fails,
    because a succeeded job may return output this domain cannot parse.
    """

    pending = "pending"
    running = "running"
    done = "done"
    failed = "failed"


#: Statuses that mean work is still in flight -- the UI polls while any artefact is in this set.
ACTIVE_STATUSES = frozenset({WorkStatus.pending, WorkStatus.running})


class Archetype(StrEnum):
    """The voice a rewrite should adopt."""

    clear_crisp = "clear_crisp"
    straight_to_point = "straight_to_point"
    politically_correct = "politically_correct"
    aggressive = "aggressive"
    well_organized = "well_organized"
    action_oriented = "action_oriented"


class OutputFormat(StrEnum):
    none = "none"
    markdown = "markdown"
    json = "json"
    plain = "plain"
    table = "table"


class Tuning(BaseModel):
    """The knobs applied when Claude rewrites a prompt.

    Every field has a defensible default so an untuned version still round-trips: the defaults
    describe "a clear, moderately detailed prompt for an unspecified audience", which is what you
    want when the user has only pasted text and not touched the panel yet.
    """

    criticality: int = Field(default=3, ge=1, le=5)
    sensitivity: int = Field(default=1, ge=1, le=5)
    verbosity: int = Field(default=3, ge=1, le=5)
    archetype: Archetype = Archetype.clear_crisp
    output_format: OutputFormat = OutputFormat.none
    disclaimer: bool = False
    disclaimer_text: str | None = Field(default=None, max_length=2_000)
    keywords: list[str] = Field(default_factory=list)
    audience: str | None = Field(default=None, max_length=500)
    target_model: str = "sonnet"

    @field_validator("keywords")
    @classmethod
    def _clean_keywords(cls, value: list[str]) -> list[str]:
        """Trim, drop blanks, de-duplicate case-insensitively, and cap the list.

        Keywords go into the rewrite instruction verbatim, so a stray empty string would become a
        nonsensical "must include ''" requirement.
        """
        seen: set[str] = set()
        cleaned: list[str] = []
        for keyword in value:
            trimmed = " ".join(keyword.split())
            if not trimmed or trimmed.lower() in seen:
                continue
            seen.add(trimmed.lower())
            cleaned.append(trimmed[:80])
        return cleaned[:25]
