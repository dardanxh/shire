"""Council service: topic CRUD, roster management, and convening the debate.

`create` auto-enqueues the roster-suggestion job; `convene` claims the topic atomically
(status → r1_running with a fresh convene_id) and fans out round 1. Everything after that is
driven by the completion handlers in jobs.py.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import update
from sqlalchemy.orm import Session

from shire.core.exceptions import ConflictError, NotFoundError
from shire.core.pagination import Page, PaginationParams
from shire.domain.council.models import (
    CONVENABLE_STATUSES,
    EDITABLE_STATUSES,
    CouncilTopicRow,
)
from shire.domain.council.repositories import (
    SqlCouncilTakeRepository,
    SqlCouncilTopicRepository,
)
from shire.domain.council.schemas import (
    MAX_MEMBERS,
    CouncilMemberResult,
    CouncilTopicDetailResult,
    CouncilTopicResult,
    CreateCouncilTopic,
    UpdateCouncilMembers,
    UpdateCouncilTopic,
)
from shire.domain.hobits.services import HobitService
from shire.domain.repository.repositories import SqlRepositoryRepository


class CouncilService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._topics = SqlCouncilTopicRepository(session)
        self._takes = SqlCouncilTakeRepository(session)
        self._hobits = HobitService(session)
        self._repos = SqlRepositoryRepository(session)

    def create(self, data: CreateCouncilTopic) -> CouncilTopicDetailResult:
        from shire.domain.council.jobs import enqueue_roster_suggestion

        self._require_repos(data.repository_ids)
        now = datetime.now(UTC)
        row = CouncilTopicRow(
            name=data.name,
            description=data.description,
            status="suggesting",
            devils_advocate=data.devils_advocate,
            repository_ids=[str(r) for r in data.repository_ids],
            created_at=now,
            updated_at=now,
        )
        self._topics.add(row)
        enqueue_roster_suggestion(self._session, row.id)
        return self.get(row.id)

    def list(self, params: PaginationParams) -> Page[CouncilTopicResult]:
        rows = self._topics.list(limit=params.limit, offset=params.offset)
        return Page.create(
            [CouncilTopicResult.of(r) for r in rows], self._topics.count(), params
        )

    def get(self, topic_id: uuid.UUID) -> CouncilTopicDetailResult:
        row = self._require(topic_id)
        suggested = set(row.suggested_slugs or [])
        members = [
            CouncilMemberResult(
                slug=slug, name=self._member_name(slug), suggested=slug in suggested
            )
            for slug in row.member_slugs or []
        ]
        repo_slugs = []
        for repo_id in row.repository_ids or []:
            repo = self._repos.get(uuid.UUID(repo_id))
            if repo is not None:
                repo_slugs.append(repo.coordinates.slug)
        return CouncilTopicDetailResult.of_detail(
            row,
            repository_slugs=repo_slugs,
            members=members,
            takes=self._takes.list_for_topic(topic_id),
        )

    def update(self, topic_id: uuid.UUID, data: UpdateCouncilTopic) -> CouncilTopicDetailResult:
        row = self._require(topic_id)
        if row.status not in EDITABLE_STATUSES:
            raise ConflictError("The topic can't be edited while a debate is running.")
        self._require_repos(data.repository_ids)
        row.name = data.name
        row.description = data.description
        row.devils_advocate = data.devils_advocate
        row.repository_ids = [str(r) for r in data.repository_ids]
        row.updated_at = datetime.now(UTC)
        return self.get(topic_id)

    def set_members(
        self, topic_id: uuid.UUID, data: UpdateCouncilMembers
    ) -> CouncilTopicDetailResult:
        row = self._require(topic_id)
        if row.status not in EDITABLE_STATUSES:
            raise ConflictError("The roster can't be edited while a debate is running.")
        deduped: list[str] = []
        for slug in data.slugs:
            if slug in deduped:
                continue
            if self._hobits.resolve_spec(slug) is None:
                raise NotFoundError(f"Unknown hobit: {slug}")
            deduped.append(slug)
        row.member_slugs = deduped
        row.roster_edited = True
        row.updated_at = datetime.now(UTC)
        return self.get(topic_id)

    def convene(self, topic_id: uuid.UUID) -> CouncilTopicDetailResult:
        """Start (or restart) the debate: atomically claim the topic, wipe the previous debate,
        and fan out round 1. The claim makes duplicate convene clicks a clean 409."""
        from shire.domain.council.jobs import enqueue_round_one

        row = self._require(topic_id)
        if not row.member_slugs:
            raise ConflictError("Pick at least one council member before convening.")
        if len(row.member_slugs) > MAX_MEMBERS:
            raise ConflictError(f"A council is capped at {MAX_MEMBERS} members.")
        now = datetime.now(UTC)
        claimed = self._session.execute(
            update(CouncilTopicRow)
            .where(
                CouncilTopicRow.id == topic_id,
                CouncilTopicRow.status.in_(CONVENABLE_STATUSES),
            )
            .values(
                status="r1_running",
                convene_id=uuid.uuid4(),
                convened_at=now,
                updated_at=now,
                synthesis_headline=None,
                synthesis_narrative=None,
                key_disagreements=None,
                chair_raw_output=None,
                error=None,
                completed_at=None,
            )
        )
        if claimed.rowcount != 1:
            raise ConflictError("A debate is already running for this topic.")
        self._takes.delete_for_topic(topic_id)
        self._session.expire_all()  # re-read the claimed status/convene_id below
        enqueue_round_one(self._session, topic_id)
        return self.get(topic_id)

    def delete(self, topic_id: uuid.UUID) -> None:
        self._require(topic_id)
        self._topics.delete(topic_id)  # takes cascade via FK

    # --- helpers --------------------------------------------------------------
    def _require(self, topic_id: uuid.UUID) -> CouncilTopicRow:
        row = self._topics.get(topic_id)
        if row is None:
            raise NotFoundError("Council topic not found")
        return row

    def _require_repos(self, repository_ids: list[uuid.UUID]) -> None:
        missing = [str(r) for r in repository_ids if self._repos.get(r) is None]
        if missing:
            raise NotFoundError(f"Unknown repositories: {', '.join(missing)}")

    def _member_name(self, slug: str) -> str:
        spec = self._hobits.resolve_spec(slug)
        return spec.name if spec is not None else slug
