"""Data access for the prompts domain. Entities in, entities out."""

from __future__ import annotations

import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from shire.domain.prompts.models import (
    PromptJudgementRow,
    PromptReviewRow,
    PromptRow,
    PromptRunRow,
    PromptSuggestionRow,
    PromptVersionRow,
)


class SqlPromptRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, row: PromptRow) -> None:
        self._session.add(row)
        self._session.flush()  # row.id available to the caller

    def get(self, prompt_id: uuid.UUID) -> PromptRow | None:
        return self._session.get(PromptRow, prompt_id)

    def count(self) -> int:
        return self._session.scalar(select(func.count()).select_from(PromptRow)) or 0

    def list(self, *, limit: int, offset: int) -> list[PromptRow]:
        """Most recently touched first. The id tiebreaker keeps paging stable when two prompts
        share an `updated_at` (creating several in one sitting)."""
        stmt = (
            select(PromptRow)
            .order_by(PromptRow.updated_at.desc(), PromptRow.id)
            .limit(limit)
            .offset(offset)
        )
        return list(self._session.scalars(stmt))

    def delete(self, prompt_id: uuid.UUID) -> None:
        # Drop the pointer first: the FK is ON DELETE SET NULL, but versions cascade, so leaving it
        # set would have Postgres resolving a self-referential delete order for no reason.
        row = self.get(prompt_id)
        if row is not None:
            row.current_version_id = None
            self._session.flush()
        self._session.execute(delete(PromptRow).where(PromptRow.id == prompt_id))


class SqlPromptVersionRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, row: PromptVersionRow) -> None:
        self._session.add(row)
        self._session.flush()

    def get(self, version_id: uuid.UUID) -> PromptVersionRow | None:
        return self._session.get(PromptVersionRow, version_id)

    def list_for_prompt(self, prompt_id: uuid.UUID) -> list[PromptVersionRow]:
        """Newest version first."""
        stmt = (
            select(PromptVersionRow)
            .where(PromptVersionRow.prompt_id == prompt_id)
            .order_by(PromptVersionRow.number.desc())
        )
        return list(self._session.scalars(stmt))

    def next_number(self, prompt_id: uuid.UUID) -> int:
        """1-based, contiguous. Versions are never deleted, so MAX+1 cannot collide."""
        current = self._session.scalar(
            select(func.max(PromptVersionRow.number)).where(
                PromptVersionRow.prompt_id == prompt_id
            )
        )
        return (current or 0) + 1

    def summaries_for(
        self, prompt_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, list[tuple[int, int]]]:
        """`{prompt_id: [(number, static_score), ...]}` oldest first, for the whole page in one
        query -- the list view needs a per-prompt score history and must not do it N times."""
        if not prompt_ids:
            return {}
        stmt = (
            select(
                PromptVersionRow.prompt_id, PromptVersionRow.number, PromptVersionRow.static_score
            )
            .where(PromptVersionRow.prompt_id.in_(prompt_ids))
            .order_by(PromptVersionRow.prompt_id, PromptVersionRow.number)
        )
        summaries: dict[uuid.UUID, list[tuple[int, int]]] = {}
        for prompt_id, number, score in self._session.execute(stmt):
            summaries.setdefault(prompt_id, []).append((number, score))
        return summaries


class SqlPromptReviewRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, row: PromptReviewRow) -> None:
        self._session.add(row)
        self._session.flush()

    def list_for_version(self, version_id: uuid.UUID) -> list[PromptReviewRow]:
        """Newest first."""
        stmt = (
            select(PromptReviewRow)
            .where(PromptReviewRow.version_id == version_id)
            .order_by(PromptReviewRow.created_at.desc(), PromptReviewRow.id)
        )
        return list(self._session.scalars(stmt))

    def latest_done_for_versions(
        self, version_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, PromptReviewRow]:
        """The newest settled review per version, for the whole set in one query.

        The metrics series needs one point per version; doing this per version would be an N+1 on
        a page that exists to render a chart.
        """
        if not version_ids:
            return {}
        stmt = (
            select(PromptReviewRow)
            .where(
                PromptReviewRow.version_id.in_(version_ids),
                PromptReviewRow.status == "done",
            )
            .order_by(PromptReviewRow.version_id, PromptReviewRow.created_at.desc())
        )
        latest: dict[uuid.UUID, PromptReviewRow] = {}
        for row in self._session.scalars(stmt):
            latest.setdefault(row.version_id, row)
        return latest

    def has_unsettled(self, version_id: uuid.UUID) -> bool:
        return (
            self._session.scalar(
                select(func.count())
                .select_from(PromptReviewRow)
                .where(
                    PromptReviewRow.version_id == version_id,
                    PromptReviewRow.status.in_(("pending", "running")),
                )
            )
            or 0
        ) > 0


class SqlPromptSuggestionRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, row: PromptSuggestionRow) -> None:
        self._session.add(row)
        self._session.flush()

    def get(self, suggestion_id: uuid.UUID) -> PromptSuggestionRow | None:
        return self._session.get(PromptSuggestionRow, suggestion_id)

    def list_for_version(self, version_id: uuid.UUID) -> list[PromptSuggestionRow]:
        """Newest first."""
        stmt = (
            select(PromptSuggestionRow)
            .where(PromptSuggestionRow.version_id == version_id)
            .order_by(PromptSuggestionRow.created_at.desc(), PromptSuggestionRow.id)
        )
        return list(self._session.scalars(stmt))

    def has_unsettled(self, version_id: uuid.UUID) -> bool:
        """Guard against stacking suggestion jobs on one version from a double-click."""
        return (
            self._session.scalar(
                select(func.count())
                .select_from(PromptSuggestionRow)
                .where(
                    PromptSuggestionRow.version_id == version_id,
                    PromptSuggestionRow.status.in_(("pending", "running")),
                )
            )
            or 0
        ) > 0


class SqlPromptArenaRepository:
    """Runs and judgements. Both are addressed by batch, because a batch is the unit the user
    started and the unit the judge reasons over."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def add_run(self, row: PromptRunRow) -> None:
        self._session.add(row)
        self._session.flush()

    def add_judgement(self, row: PromptJudgementRow) -> None:
        self._session.add(row)
        self._session.flush()

    def runs_for_version(self, version_id: uuid.UUID) -> list[PromptRunRow]:
        """Newest batch first, and within a batch ordered by model for a stable column order."""
        stmt = (
            select(PromptRunRow)
            .where(PromptRunRow.version_id == version_id)
            .order_by(PromptRunRow.created_at.desc(), PromptRunRow.model)
        )
        return list(self._session.scalars(stmt))

    def judgements_for_version(self, version_id: uuid.UUID) -> list[PromptJudgementRow]:
        stmt = (
            select(PromptJudgementRow)
            .where(PromptJudgementRow.version_id == version_id)
            .order_by(PromptJudgementRow.created_at.desc())
        )
        return list(self._session.scalars(stmt))

    def has_unsettled_runs(self, version_id: uuid.UUID) -> bool:
        return (
            self._session.scalar(
                select(func.count())
                .select_from(PromptRunRow)
                .where(
                    PromptRunRow.version_id == version_id,
                    PromptRunRow.status.in_(("pending", "running")),
                )
            )
            or 0
        ) > 0

    def done_runs_for_versions(
        self, version_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, list[PromptRunRow]]:
        """Settled runs grouped by version, for the metrics series in one query."""
        if not version_ids:
            return {}
        stmt = (
            select(PromptRunRow)
            .where(
                PromptRunRow.version_id.in_(version_ids),
                PromptRunRow.status == "done",
            )
            .order_by(PromptRunRow.version_id, PromptRunRow.created_at)
        )
        grouped: dict[uuid.UUID, list[PromptRunRow]] = {}
        for row in self._session.scalars(stmt):
            grouped.setdefault(row.version_id, []).append(row)
        return grouped

    def judge_overall_for_versions(
        self, version_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, int]:
        """Mean `overall` the judge gave each version's answers, across every settled judgement.

        The scores live in a JSONB list, so the averaging happens in Python -- pushing it into SQL
        would mean unnesting the array for a handful of rows, which is not worth the query.
        """
        if not version_ids:
            return {}
        stmt = select(PromptJudgementRow).where(
            PromptJudgementRow.version_id.in_(version_ids),
            PromptJudgementRow.status == "done",
        )
        collected: dict[uuid.UUID, list[int]] = {}
        for row in self._session.scalars(stmt):
            for score in row.scores or []:
                overall = score.get("overall")
                if isinstance(overall, int):
                    collected.setdefault(row.version_id, []).append(overall)
        return {
            version_id: round(sum(values) / len(values))
            for version_id, values in collected.items()
        }
