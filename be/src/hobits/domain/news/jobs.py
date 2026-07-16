"""The news prompts + the completion handlers that settle poll runs and recommendations.

The poll agent is the platform's first web-facing engine job (WebSearch + WebFetch, no repo
clone). Dedup happens at two layers: the prompt carries the topic's recently seen articles so
the agent doesn't re-report them (soft), and every insert goes through a globally unique
fingerprint of the normalized URL with ON CONFLICT DO NOTHING (hard) — so a slipped-through
repeat costs nothing and can never duplicate a feed row.
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import UTC, datetime
from urllib.parse import parse_qsl, urlencode, urlsplit

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from hobits.core.db import unit_of_work
from hobits.domain.jobs.models import JobRow
from hobits.domain.news.models import (
    NewsItemRow,
    NewsPollRow,
    NewsRecommendationRow,
    NewsSourceRow,
    NewsTopicRow,
)

logger = logging.getLogger(__name__)

# How many of the topic's newest items ride along in the prompt as the soft-dedup seen-list.
SEEN_LIMIT = 50

_POLL_PROMPT = """\
You are a technology-news researcher tracking the topic **{name}** for an engineering team.
{description_block}
## Configured sources
{sources_block}

## Additional discovery
Beyond the configured sources, run 2-4 WebSearch queries for recent, substantive news on this \
topic — product announcements, releases, deep-dive engineering articles. Skip aggregator pages, \
listicles and marketing fluff.

## Already reported — do NOT repeat
The following articles are already in the feed. Do not report them again, nor near-duplicates \
covering the same announcement:
{seen_block}

## Output
Only include items published after {since}; when a page shows no date, use your judgment about \
recency. Return ONLY a single fenced json object as the very last thing, nothing else:
```json
{{
  "items": [
    {{
      "title": "the article's own headline",
      "url": "https://the-canonical-article-url",
      "summary": "2-3 factual sentences: what happened and why it matters",
      "published_at": "YYYY-MM-DD" or null,
      "from_configured_source": true or false
    }}
  ]
}}
```
At most {max_items} items, most significant first. `url` must be the article's own page — never \
a search, category or aggregator URL. Return `"items": []` if there is nothing new."""

_RECOMMEND_PROMPT = """\
You advise an engineering team on which technology-news topics to follow. Below is a digest of \
their repository portfolio — languages, dependencies, security posture, and per-repo narratives.

## Portfolio digest
{digest}

## Topics they already follow (do not suggest these or trivial variations)
{existing_block}

## Previously dismissed suggestions (do not suggest these again)
{dismissed_block}

## Your job
Suggest 3-7 news topics this team should follow to stay technically ahead: technologies they \
depend on (releases, features, deprecations), risks visible in their portfolio (e.g. \
vulnerability-heavy ecosystems), and adjacent developments they are well-positioned to adopt. \
Each rationale must point at concrete evidence from the digest.

Return ONLY a single fenced json object as the very last thing, nothing else:
```json
{{
  "topics": [
    {{"name": "short topic name", "rationale": "1-2 sentences grounded in the digest"}}
  ]
}}
```"""

# Query parameters that identify a click, not an article — stripped before fingerprinting.
_TRACKING_PARAMS = frozenset(
    {
        "gclid",
        "fbclid",
        "msclkid",
        "mc_cid",
        "mc_eid",
        "ref",
        "ref_src",
        "source",
        "cmpid",
        "igshid",
    }
)


def normalize_url(url: str) -> str:
    """Canonical form of an article URL, so trivially different links map to one fingerprint."""
    parts = urlsplit(url.strip())
    host = (parts.hostname or "").lower().removeprefix("www.")
    if parts.port and parts.port not in (80, 443):
        host = f"{host}:{parts.port}"
    path = parts.path.rstrip("/")
    query = urlencode(
        sorted(
            (k, v)
            for k, v in parse_qsl(parts.query, keep_blank_values=True)
            if not k.lower().startswith("utm_") and k.lower() not in _TRACKING_PARAMS
        )
    )
    return f"https://{host}{path}" + (f"?{query}" if query else "")


def fingerprint(url: str) -> str:
    return hashlib.sha256(normalize_url(url).encode()).hexdigest()


def url_domain(url: str) -> str | None:
    host = (urlsplit(url.strip()).hostname or "").lower().removeprefix("www.")
    return host or None


def build_poll_prompt(
    topic: NewsTopicRow,
    sources: list[NewsSourceRow],
    seen: list[NewsItemRow],
    max_items: int,
) -> str:
    description_block = f"\n{topic.description.strip()}\n" if topic.description else ""
    if sources:
        lines = [f"- {s.url}" + (f" ({s.note})" if s.note else "") for s in sources]
        sources_block = (
            "WebFetch each of these URLs and extract any news items from them:\n"
            + "\n".join(lines)
        )
    else:
        sources_block = "No sources are configured for this topic — rely on web search."
    if seen:
        seen_block = "\n".join(f"- {i.title} — {normalize_url(i.url)}" for i in seen)
    else:
        seen_block = "(nothing reported yet — this is the first poll)"
    since = (
        topic.last_polled_at.strftime("%Y-%m-%d")
        if topic.last_polled_at
        else "roughly one week ago"
    )
    return _POLL_PROMPT.format(
        name=topic.name,
        description_block=description_block,
        sources_block=sources_block,
        seen_block=seen_block,
        since=since,
        max_items=max_items,
    )


def build_recommend_prompt(digest: str, existing: list[str], dismissed: list[str]) -> str:
    existing_block = "\n".join(f"- {n}" for n in existing) or "(none yet)"
    dismissed_block = "\n".join(f"- {n}" for n in dismissed) or "(none)"
    return _RECOMMEND_PROMPT.format(
        digest=digest, existing_block=existing_block, dismissed_block=dismissed_block
    )


def handle_news_poll(job: JobRow) -> None:
    poll_id = uuid.UUID(job.payload["poll_id"])
    max_items = int(job.payload.get("max_items") or 10)
    with unit_of_work() as session:
        poll = session.get(NewsPollRow, poll_id)
        if poll is None or poll.status != "pending":
            return  # topic deleted, or already settled by an earlier dispatch

        now = datetime.now(UTC)
        poll.finished_at = now
        poll.duration_seconds = job.duration_seconds

        if job.status != "succeeded":
            poll.status = "error"
            poll.error = job.error or "The poll job failed."
            return

        items = _parse_items(job.result or "")
        if items is None:
            poll.status = "error"
            poll.error = "Could not parse the agent's structured item list."
            return

        inserted = 0
        for item in items[:max_items]:
            stmt = (
                pg_insert(NewsItemRow)
                .values(
                    id=uuid.uuid4(),
                    topic_id=poll.topic_id,
                    title=item["title"][:500],
                    url=item["url"],
                    domain=url_domain(item["url"]),
                    summary=item.get("summary"),
                    published_at=item.get("published_at"),
                    fingerprint=fingerprint(item["url"]),
                    from_configured_source=bool(item.get("from_configured_source")),
                    job_id=job.id,
                    created_at=now,
                )
                .on_conflict_do_nothing(index_elements=["fingerprint"])
                # RETURNING yields a row only when the insert actually happened, which is the
                # reliable dedup signal (the driver reports rowcount -1 for this statement shape).
                .returning(NewsItemRow.id)
            )
            if session.execute(stmt).first() is not None:
                inserted += 1

        poll.status = "succeeded"
        poll.items_found = len(items)
        poll.items_inserted = inserted
        topic = session.get(NewsTopicRow, poll.topic_id)
        if topic is not None:
            topic.last_polled_at = now


def handle_news_recommend(job: JobRow) -> None:
    with unit_of_work() as session:
        if job.status != "succeeded":
            return  # nothing to settle — the failure is visible on the job row

        parsed = _parse_topics(job.result or "")
        if parsed is None:
            logger.warning("news.recommend job %s returned no parseable topics.", job.id)
            return

        # A suggestion is redundant if a topic or a live/decided suggestion already carries
        # the same name (case-insensitive); dismissed names stay to keep suppressing re-suggests.
        taken = {
            n.lower()
            for n in session.scalars(select(NewsTopicRow.name)).all()
        } | {
            n.lower()
            for n in session.scalars(select(NewsRecommendationRow.name)).all()
        }
        now = datetime.now(UTC)
        for entry in parsed:
            name = entry["name"].strip()
            if not name or name.lower() in taken:
                continue
            taken.add(name.lower())
            session.add(
                NewsRecommendationRow(
                    name=name[:120],
                    rationale=entry.get("rationale"),
                    status="suggested",
                    job_id=job.id,
                    created_at=now,
                )
            )


def _parse_items(text: str) -> list[dict] | None:
    block = _extract_json_object(text)
    if block is None:
        return None
    try:
        data = json.loads(block)
    except (json.JSONDecodeError, ValueError):
        return None
    raw = data.get("items") if isinstance(data, dict) else None
    if not isinstance(raw, list):
        return None
    items = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        title, url = entry.get("title"), entry.get("url")
        if not title or not isinstance(url, str) or not url.startswith(("http://", "https://")):
            continue
        items.append(
            {
                "title": str(title),
                "url": url,
                "summary": str(entry["summary"]) if entry.get("summary") else None,
                "published_at": _parse_date(entry.get("published_at")),
                "from_configured_source": entry.get("from_configured_source"),
            }
        )
    return items


def _parse_topics(text: str) -> list[dict] | None:
    block = _extract_json_object(text)
    if block is None:
        return None
    try:
        data = json.loads(block)
    except (json.JSONDecodeError, ValueError):
        return None
    raw = data.get("topics") if isinstance(data, dict) else None
    if not isinstance(raw, list):
        return None
    return [
        {
            "name": str(entry["name"]),
            "rationale": str(entry["rationale"]) if entry.get("rationale") else None,
        }
        for entry in raw
        if isinstance(entry, dict) and entry.get("name")
    ]


def _parse_date(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.strip()).replace(tzinfo=UTC)
    except ValueError:
        return None


def _extract_json_object(text: str) -> str | None:
    """The final fenced ```json {...}``` object in the agent's output (else a bare {...})."""
    marker = text.rfind("```json")
    if marker != -1:
        after = text.find("\n", marker)
        close = text.find("```", after + 1) if after != -1 else -1
        if after != -1 and close > after:
            return text[after:close].strip() or None
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        return text[start : end + 1]
    return None
