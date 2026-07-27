"""The council debate as a job chain.

Convene fans out round 1 (one independent take per member). Each take's completion handler
settles its row and, when the round has fully settled, atomically advances the topic
(status r1_running→r2_running→synthesizing — the merge-review claim pattern) and enqueues the
next round: round 2 (each member challenges the others' round-1 takes, plus the devil's
advocate when toggled) and finally the chair, whose synthesis lands on the topic row.

All council jobs are prompt-only (no cwd): grounding comes from budgeted context-pack digests
of the topic's attached repositories, embedded in the prompts. Every job carries the topic's
`convene_id`; a re-convene mid-flight makes stale jobs no-op.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import update
from sqlalchemy.orm import Session

from shire.core.db import unit_of_work
from shire.core.exceptions import NotFoundError
from shire.domain.context.services import ContextService
from shire.domain.council.models import (
    DEVILS_ADVOCATE_NAME,
    DEVILS_ADVOCATE_SLUG,
    UNSETTLED_TAKE_STATUSES,
    CouncilTakeRow,
    CouncilTopicRow,
)
from shire.domain.council.repositories import SqlCouncilTakeRepository
from shire.domain.hobits.repo_hobit import extract_json_block
from shire.domain.hobits.services import HobitService
from shire.domain.jobs import kinds
from shire.domain.jobs.models import JobRow
from shire.domain.jobs.services import JobService
from shire.domain.repository.repositories import SqlRepositoryRepository

logger = logging.getLogger(__name__)

# Token budgets: repo digests mirror the roadmap digest caps; take excerpts keep the R2 and
# chair prompts bounded even at the 8-member roster cap.
_DIGEST_TOTAL_BUDGET = 30_000
_DIGEST_REPO_CAP = 3_500
_DIGEST_REPO_FLOOR = 1_500
_R1_EXCERPT_CHARS = 2_500
_CHAIR_R1_EXCERPT_CHARS = 1_500
_CHAIR_R2_EXCERPT_CHARS = 2_500
_ROSTER_TIMEOUT_SECONDS = 120.0
_MAX_SUGGESTED = 8

# --- prompts ------------------------------------------------------------------------------------

_JSON_TAIL = """\
Return ONLY a single fenced json block as the very last thing in your response, nothing after \
it. The narrative value must be a JSON string (escape any quotes/newlines); do not put ``` \
fences inside it. Shape:
```json
{shape}
```"""

_ROSTER_PROMPT = """\
You are assembling the roster for a council debate. From the available members below, pick the \
ones whose expertise is most relevant to the topic. Do not use any tools — everything you need \
is below.

## Topic

**{name}**

{description}

## Available members

{roster_block}

## Rules

- Pick 3-5 members, most relevant first.
- Only use slugs that appear in the list above, exactly as written.
- Favor complementary perspectives over near-duplicates.

Return ONLY a single fenced json block as the very last thing in your response, nothing after \
it. Shape:
```json
{{"slugs": ["most-relevant-slug", "next-slug"]}}
```"""

_R1_PROMPT = """\
You are **{member_name}**, one member of a council convened to debate the topic below. This is \
ROUND 1 of 3: every member gives an independent take. You have not seen the other members' \
positions — do not try to anticipate them; argue purely from your own expertise. Do not use \
any tools — everything you need is below.

## Topic

**{name}**

{description}
{repos_section}{guidance_section}
## Your task

Give your independent take: your position, your strongest arguments, the risks or \
opportunities you see from your specialty, and a concrete recommendation. Ground every claim \
you can in the repository context above; say so explicitly when you are speculating.

""" + _JSON_TAIL.format(
    shape='{{"headline": "<your position in one sentence>", '
    '"narrative": "<your full take, as markdown>"}}'
)

_R2_PROMPT = """\
You are **{member_name}**, one member of a council debating the topic below. This is ROUND 2 \
of 3: every member's independent round-1 take is reproduced below, including your own. Do not \
use any tools — everything you need is below.

## Topic

**{name}**

{description}
{repos_section}{guidance_section}
## Round-1 takes

{takes_block}

## Your task

- Challenge: where are the other members wrong, missing something, or overconfident? Name the \
member you are responding to.
- Refine: update your own round-1 position given what the others said, and concede points \
where they are right.
- End with your revised recommendation.

""" + _JSON_TAIL.format(
    shape='{{"headline": "<your revised position in one sentence>", '
    '"narrative": "<your challenges and refined take, as markdown>"}}'
)

DEVILS_ADVOCATE_CHARTER = """\
You are the council's devil's advocate: a professional contrarian whose only job is to \
stress-test the group's thinking. You hold no stake in any position. You are rigorous, \
specific and unsparing — but never contrarian for its own sake: every objection you raise \
must be one a serious skeptic would actually make."""

_DEVILS_ADVOCATE_PROMPT = """\
A council is debating the topic below; every member's independent round-1 take is reproduced. \
This is ROUND 2 and you are the devil's advocate: your job is to refute the emerging \
consensus, not to add another take. Do not use any tools — everything you need is below.

## Topic

**{name}**

{description}
{repos_section}
## Round-1 takes

{takes_block}

## Your task

- Identify where the members agree — that agreement is your target.
- Attack it: the strongest counter-arguments, the unstated assumptions, the failure modes the \
members are glossing over, and the concrete scenario in which the consensus recommendation \
goes badly wrong.
- Where the repository context contradicts the consensus, cite it.
- Do not offer a balanced view — the other members handle that. Be the strongest possible \
opposition.

""" + _JSON_TAIL.format(
    shape='{{"headline": "<the consensus\'s biggest weakness in one sentence>", '
    '"narrative": "<your refutation, as markdown>"}}'
)

CHAIR_CHARTER = """\
You chair a council of specialist advisors. You are neutral: you hold no position of your own \
until the synthesis, and you weigh arguments on their merits, not on who made them. Your \
synthesis is what the user will act on — it must be decisive, grounded, and honest about \
uncertainty."""

_CHAIR_PROMPT = """\
The council has finished debating the topic below in two rounds: independent takes (round 1), \
then challenges and refinements (round 2){da_clause}. This is ROUND 3 and you are the chair: \
synthesize the final recommendation. Do not use any tools — everything you need is below.

## Topic

**{name}**

{description}
{repos_section}
## Round-1 takes (independent)

{r1_block}

## Round-2 takes (challenges and refinements)

{r2_block}

## Your task

- Give ONE clear final recommendation with concrete next steps.
- Ground it: where the repository context supports or undercuts an argument, say so.
- Weigh the disagreements honestly: name who disagreed about what and why you sided the way \
you did.
{da_instruction}- Be honest about residual uncertainty and what evidence would change the \
recommendation.

""" + _JSON_TAIL.format(
    shape='{{"headline": "<the final recommendation in one sentence>", '
    '"narrative": "<the full synthesis, as markdown>", '
    '"key_disagreements": ["<one unresolved or notable disagreement per entry>"]}}'
)

_DA_CLAUSE = ", plus a devil's-advocate refutation of the emerging consensus"
_DA_INSTRUCTION = (
    "- The take marked [DEVIL'S ADVOCATE] exists to attack the consensus. You MUST address "
    "its strongest objections head-on: rebut each one specifically or fold it into the "
    "recommendation — never wave them off.\n"
)


# --- prompt building blocks ---------------------------------------------------------------------


def _digest(session: Session, repository_ids: list[str]) -> str:
    """Budgeted context-pack digest of the topic's repositories. Deleted repos are skipped;
    unanalyzed ones degrade to a note rather than blocking the debate."""
    repos = SqlRepositoryRepository(session)
    context = ContextService(session)
    ids = [uuid.UUID(r) for r in repository_ids or []]
    resolved = [(i, repos.get(i)) for i in ids]
    present = [(i, r) for i, r in resolved if r is not None]
    if not present:
        return ""
    per_repo = min(
        _DIGEST_REPO_CAP, max(_DIGEST_REPO_FLOOR, _DIGEST_TOTAL_BUDGET // len(present))
    )
    sections = []
    for repo_id, repo in present:
        try:
            markdown = context.get_markdown(repo_id).effective[:per_repo]
        except NotFoundError:
            markdown = "(not analyzed yet — argue from the topic alone)"
        sections.append(f"### {repo.coordinates.slug}\n\n{markdown}")
    return "\n\n".join(sections)[:_DIGEST_TOTAL_BUDGET]


def _repos_section(digest: str) -> str:
    if not digest:
        return ""
    return (
        "\n## Repository context\n\nGround your arguments in this snapshot of the attached "
        f"repositories where you can:\n\n{digest}\n"
    )


def _guidance_section(session: Session, slug: str) -> str:
    guidance = HobitService(session).get_guidance(slug).guidance
    if not guidance:
        return ""
    return f"\n## Standing guidance from your user\n\n{guidance}\n"


def _takes_block(takes: list[CouncilTakeRow], excerpt_chars: int) -> str:
    sections = []
    for take in takes:
        marker = " [DEVIL'S ADVOCATE]" if take.hobit_slug == DEVILS_ADVOCATE_SLUG else ""
        headline = f"**{take.headline}**\n\n" if take.headline else ""
        narrative = (take.narrative or "")[:excerpt_chars]
        sections.append(f"### {take.hobit_name}{marker}\n\n{headline}{narrative}")
    return "\n\n".join(sections)


# --- enqueue (called by the service inside the request transaction) -----------------------------


def enqueue_roster_suggestion(session: Session, topic_id: uuid.UUID) -> None:
    row = session.get(CouncilTopicRow, topic_id)
    if row is None:
        return
    hobits = HobitService(session).list_hobits()
    roster_block = "\n".join(
        f"- {h.slug} — {h.name}: {h.description}"
        + (f" [tags: {', '.join(h.tags)}]" if h.tags else "")
        for h in hobits
    )
    jobs = JobService(session)
    model, _timeout = jobs.engine_defaults()
    jobs.enqueue(
        kind=kinds.COUNCIL_ROSTER,
        title=f"Council roster — {row.name}",
        prompt=_ROSTER_PROMPT.format(
            name=row.name, description=row.description, roster_block=roster_block
        ),
        payload={
            "topic_id": str(topic_id),
            "model": model,
            "timeout_seconds": _ROSTER_TIMEOUT_SECONDS,
        },
    )


def enqueue_round_one(session: Session, topic_id: uuid.UUID) -> None:
    """Fan out round 1: one independent-take job per roster member. Members whose spec
    vanished settle as error takes; if nobody resolves, the topic fails outright (no
    completion handler would ever advance it)."""
    row = session.get(CouncilTopicRow, topic_id)
    if row is None:
        return
    digest = _digest(session, row.repository_ids)
    repos_section = _repos_section(digest)
    takes = SqlCouncilTakeRepository(session)
    hobits = HobitService(session)
    now = datetime.now(UTC)
    enqueued = 0
    for slug in row.member_slugs or []:
        spec = hobits.resolve_spec(slug)
        if spec is None:
            takes.add(
                CouncilTakeRow(
                    topic_id=topic_id,
                    round=1,
                    hobit_slug=slug,
                    hobit_name=slug,
                    status="error",
                    error="The hobit no longer exists.",
                    finished_at=now,
                )
            )
            continue
        config = hobits.effective_config_for(spec)
        take = CouncilTakeRow(
            topic_id=topic_id,
            round=1,
            hobit_slug=slug,
            hobit_name=config.name,
            status="running",
            started_at=now,
        )
        takes.add(take)
        JobService(session).enqueue(
            kind=kinds.COUNCIL_TAKE_R1,
            title=f"Council R1: {config.name} — {row.name}",
            prompt=_R1_PROMPT.format(
                member_name=config.name,
                name=row.name,
                description=row.description,
                repos_section=repos_section,
                guidance_section=_guidance_section(session, slug),
            ),
            payload={
                "system": config.charter,
                "model": config.model,
                "timeout_seconds": config.timeout_seconds,
                "topic_id": str(topic_id),
                "take_id": str(take.id),
                "slug": slug,
                "round": 1,
                "convene_id": str(row.convene_id),
            },
        )
        enqueued += 1
    if enqueued == 0:
        row.status = "failed"
        row.error = "No council members could be resolved."
        row.updated_at = now


# --- completion handlers (called by the jobs dispatcher) ----------------------------------------


def handle_council_roster(job: JobRow) -> None:
    topic_id = uuid.UUID(job.payload["topic_id"])
    with unit_of_work() as session:
        row = session.get(CouncilTopicRow, topic_id)
        if row is None:
            return
        slugs = _parse_slugs(job.result or "") if job.status == "succeeded" else None
        hobits = HobitService(session)
        valid = [s for s in slugs or [] if hobits.resolve_spec(s) is not None][:_MAX_SUGGESTED]
        row.suggested_slugs = valid
        if slugs is None:
            row.roster_error = job.error or "Could not parse the roster suggestion."
        # The user may have edited the roster (or even convened) while the suggestion ran —
        # only fill member_slugs when they haven't touched anything yet.
        if row.status == "suggesting":
            if not row.roster_edited and valid:
                row.member_slugs = valid
            row.status = "ready"
        row.updated_at = datetime.now(UTC)


def handle_council_take_r1(job: JobRow) -> None:
    if _settle_take(job):
        _maybe_advance(uuid.UUID(job.payload["topic_id"]), job.payload["convene_id"])


def handle_council_take_r2(job: JobRow) -> None:
    if _settle_take(job):
        _maybe_synthesize(uuid.UUID(job.payload["topic_id"]), job.payload["convene_id"])


def handle_council_chair(job: JobRow) -> None:
    topic_id = uuid.UUID(job.payload["topic_id"])
    with unit_of_work() as session:
        row = session.get(CouncilTopicRow, topic_id)
        if row is None or str(row.convene_id) != job.payload["convene_id"]:
            return
        if row.status != "synthesizing":
            return
        now = datetime.now(UTC)
        row.chair_raw_output = job.result
        row.updated_at = now
        if job.status != "succeeded":
            row.status = "failed"
            row.error = job.error or "The chair job failed."
            return
        parsed = _parse_synthesis(job.result or "")
        if parsed is None:
            row.status = "failed"
            row.error = "Could not parse the chair's synthesis."
            return
        headline, narrative, disagreements = parsed
        row.synthesis_headline = headline[:500]
        row.synthesis_narrative = narrative
        row.key_disagreements = disagreements
        row.status = "completed"
        row.completed_at = now


# --- chain steps --------------------------------------------------------------------------------


def _settle_take(job: JobRow) -> bool:
    """Persist a take job's outcome onto its row. Returns False when the job is stale
    (re-convene, deleted topic) or already settled (dispatcher sweep replays)."""
    topic_id = uuid.UUID(job.payload["topic_id"])
    with unit_of_work() as session:
        topic = session.get(CouncilTopicRow, topic_id)
        if topic is None or str(topic.convene_id) != job.payload["convene_id"]:
            return False
        take = SqlCouncilTakeRepository(session).get(uuid.UUID(job.payload["take_id"]))
        if take is None or take.status not in UNSETTLED_TAKE_STATUSES:
            return False
        take.raw_output = job.result
        take.duration_seconds = job.duration_seconds
        take.finished_at = datetime.now(UTC)
        if job.status != "succeeded":
            take.status = _failure_status(job.error)
            take.error = job.error
            return True
        parsed = _parse_take(job.result or "")
        if parsed is None:
            # Keep the prose so the debate still shows something useful.
            take.status = "parse_failed"
            take.narrative = job.result or None
            take.error = "Could not parse the take's structured output."
            return True
        take.status = "completed"
        take.headline = parsed[0][:500]
        take.narrative = parsed[1]
        return True


def _maybe_advance(topic_id: uuid.UUID, convene_id: str) -> None:
    """R1 → R2: once every round-1 take has settled, advance exactly once (atomic claim).
    R2 fans out only to members whose R1 completed; with zero survivors the topic fails."""
    with unit_of_work() as session:
        takes = SqlCouncilTakeRepository(session).list_for_round(topic_id, 1)
        if not takes or any(t.status in UNSETTLED_TAKE_STATUSES for t in takes):
            return
        survivors = any(t.status == "completed" for t in takes)
        target = "r2_running" if survivors else "failed"
        values: dict = {"status": target, "updated_at": datetime.now(UTC)}
        if not survivors:
            values["error"] = "All round-1 takes failed."
        claimed = session.execute(
            update(CouncilTopicRow)
            .where(
                CouncilTopicRow.id == topic_id,
                CouncilTopicRow.status == "r1_running",
                CouncilTopicRow.convene_id == uuid.UUID(convene_id),
            )
            .values(**values)
        )
        if claimed.rowcount != 1:
            return
    if target == "r2_running":
        _enqueue_round_two(topic_id, convene_id)


def _enqueue_round_two(topic_id: uuid.UUID, convene_id: str) -> None:
    skip_to_chair = False
    with unit_of_work() as session:
        row = session.get(CouncilTopicRow, topic_id)
        if (
            row is None
            or row.status != "r2_running"
            or str(row.convene_id) != convene_id
        ):
            return
        takes = SqlCouncilTakeRepository(session)
        r1_completed = [t for t in takes.list_for_round(topic_id, 1) if t.status == "completed"]
        digest = _digest(session, row.repository_ids)
        repos_section = _repos_section(digest)
        takes_block = _takes_block(r1_completed, _R1_EXCERPT_CHARS)
        hobits = HobitService(session)
        jobs = JobService(session)
        now = datetime.now(UTC)
        enqueued = 0
        for r1_take in r1_completed:
            slug = r1_take.hobit_slug
            spec = hobits.resolve_spec(slug)
            if spec is None:
                takes.add(
                    CouncilTakeRow(
                        topic_id=topic_id,
                        round=2,
                        hobit_slug=slug,
                        hobit_name=r1_take.hobit_name,
                        status="error",
                        error="The hobit no longer exists.",
                        finished_at=now,
                    )
                )
                continue
            config = hobits.effective_config_for(spec)
            take = CouncilTakeRow(
                topic_id=topic_id,
                round=2,
                hobit_slug=slug,
                hobit_name=config.name,
                status="running",
                started_at=now,
            )
            takes.add(take)
            jobs.enqueue(
                kind=kinds.COUNCIL_TAKE_R2,
                title=f"Council R2: {config.name} — {row.name}",
                prompt=_R2_PROMPT.format(
                    member_name=config.name,
                    name=row.name,
                    description=row.description,
                    repos_section=repos_section,
                    guidance_section=_guidance_section(session, slug),
                    takes_block=takes_block,
                ),
                payload={
                    "system": config.charter,
                    "model": config.model,
                    "timeout_seconds": config.timeout_seconds,
                    "topic_id": str(topic_id),
                    "take_id": str(take.id),
                    "slug": slug,
                    "round": 2,
                    "convene_id": convene_id,
                },
            )
            enqueued += 1
        if row.devils_advocate:
            model, timeout_seconds = jobs.engine_defaults()
            take = CouncilTakeRow(
                topic_id=topic_id,
                round=2,
                hobit_slug=DEVILS_ADVOCATE_SLUG,
                hobit_name=DEVILS_ADVOCATE_NAME,
                status="running",
                started_at=now,
            )
            takes.add(take)
            jobs.enqueue(
                kind=kinds.COUNCIL_TAKE_R2,
                title=f"Council R2: {DEVILS_ADVOCATE_NAME} — {row.name}",
                prompt=_DEVILS_ADVOCATE_PROMPT.format(
                    name=row.name,
                    description=row.description,
                    repos_section=repos_section,
                    takes_block=takes_block,
                ),
                payload={
                    "system": DEVILS_ADVOCATE_CHARTER,
                    "model": model,
                    "timeout_seconds": timeout_seconds,
                    "topic_id": str(topic_id),
                    "take_id": str(take.id),
                    "slug": DEVILS_ADVOCATE_SLUG,
                    "round": 2,
                    "convene_id": convene_id,
                },
            )
            enqueued += 1
        if enqueued == 0:
            # Every survivor's spec vanished and no DA: skip straight to the chair on R1 alone.
            claimed = session.execute(
                update(CouncilTopicRow)
                .where(
                    CouncilTopicRow.id == topic_id,
                    CouncilTopicRow.status == "r2_running",
                    CouncilTopicRow.convene_id == uuid.UUID(convene_id),
                )
                .values(status="synthesizing", updated_at=now)
            )
            skip_to_chair = claimed.rowcount == 1
    if skip_to_chair:
        _enqueue_chair(topic_id, convene_id)


def _maybe_synthesize(topic_id: uuid.UUID, convene_id: str) -> None:
    """R2 → chair: once every round-2 take has settled, always proceed — the chair degrades
    gracefully to whatever completed (R1-only in the worst case)."""
    with unit_of_work() as session:
        takes = SqlCouncilTakeRepository(session).list_for_round(topic_id, 2)
        if not takes or any(t.status in UNSETTLED_TAKE_STATUSES for t in takes):
            return
        claimed = session.execute(
            update(CouncilTopicRow)
            .where(
                CouncilTopicRow.id == topic_id,
                CouncilTopicRow.status == "r2_running",
                CouncilTopicRow.convene_id == uuid.UUID(convene_id),
            )
            .values(status="synthesizing", updated_at=datetime.now(UTC))
        )
        if claimed.rowcount != 1:
            return
    _enqueue_chair(topic_id, convene_id)


def _enqueue_chair(topic_id: uuid.UUID, convene_id: str) -> None:
    with unit_of_work() as session:
        row = session.get(CouncilTopicRow, topic_id)
        if (
            row is None
            or row.status != "synthesizing"
            or str(row.convene_id) != convene_id
        ):
            return
        takes = SqlCouncilTakeRepository(session)
        r1 = [t for t in takes.list_for_round(topic_id, 1) if t.status == "completed"]
        r2 = [t for t in takes.list_for_round(topic_id, 2) if t.status == "completed"]
        has_da = any(t.hobit_slug == DEVILS_ADVOCATE_SLUG for t in r2)
        jobs = JobService(session)
        model, timeout_seconds = jobs.engine_defaults()
        jobs.enqueue(
            kind=kinds.COUNCIL_CHAIR,
            title=f"Council chair — {row.name}",
            prompt=_CHAIR_PROMPT.format(
                name=row.name,
                description=row.description,
                repos_section=_repos_section(_digest(session, row.repository_ids)),
                r1_block=_takes_block(r1, _CHAIR_R1_EXCERPT_CHARS) or "(none completed)",
                r2_block=_takes_block(r2, _CHAIR_R2_EXCERPT_CHARS) or "(none completed)",
                da_clause=_DA_CLAUSE if has_da else "",
                da_instruction=_DA_INSTRUCTION if has_da else "",
            ),
            payload={
                "system": CHAIR_CHARTER,
                "model": model,
                "timeout_seconds": timeout_seconds,
                "topic_id": str(topic_id),
                "convene_id": convene_id,
            },
        )


# --- parsing ------------------------------------------------------------------------------------


def _parse_slugs(result: str) -> list[str] | None:
    data = _parse_json(result)
    if not isinstance(data, dict):
        return None
    slugs = data.get("slugs")
    if not isinstance(slugs, list):
        return None
    return [s for s in slugs if isinstance(s, str)]


def _parse_take(result: str) -> tuple[str, str] | None:
    data = _parse_json(result)
    if not isinstance(data, dict):
        return None
    headline, narrative = data.get("headline"), data.get("narrative")
    if not isinstance(headline, str) or not isinstance(narrative, str) or not headline.strip():
        return None
    return headline.strip(), narrative


def _parse_synthesis(result: str) -> tuple[str, str, list[str]] | None:
    data = _parse_json(result)
    if not isinstance(data, dict):
        return None
    headline, narrative = data.get("headline"), data.get("narrative")
    if not isinstance(headline, str) or not isinstance(narrative, str) or not headline.strip():
        return None
    raw = data.get("key_disagreements")
    disagreements = [d for d in raw if isinstance(d, str)] if isinstance(raw, list) else []
    return headline.strip(), narrative, disagreements


def _parse_json(result: str) -> object | None:
    block = extract_json_block(result)
    if block is None:
        return None
    try:
        return json.loads(block)
    except (json.JSONDecodeError, ValueError):
        return None


def _failure_status(error: str | None) -> str:
    if error and "timed out" in error:
        return "timeout"
    if error and "could not launch" in error:
        return "agent_unavailable"
    return "error"
