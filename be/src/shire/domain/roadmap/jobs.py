"""The roadmap generation prompt + the completion handler that materializes a version.

Generation is a single no-tools engine job (the news.recommend pattern): the multi-repo digest
is embedded in the prompt, the agent returns one fenced JSON document, and the handler turns it
into milestone/item/dependency rows. Parsing is deliberately lenient — an invalid item is
skipped, never fatal, so one hallucinated field can't void an otherwise good plan.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from shire.core.db import unit_of_work
from shire.domain.jobs.models import JobRow
from shire.domain.repository.models import RepositoryRow
from shire.domain.roadmap.models import (
    ITEM_EFFORTS,
    ITEM_LABELS,
    RoadmapItemDependencyRow,
    RoadmapItemEventRow,
    RoadmapItemRow,
    RoadmapMilestoneRow,
    RoadmapRow,
    RoadmapVersionRow,
)

logger = logging.getLogger(__name__)

# The health-radar axes every assessment must score (1-10).
RADAR_DIMENSIONS = (
    "security",
    "maintainability",
    "dependency_freshness",
    "test_confidence",
    "activity",
    "documentation",
)

_MAX_MILESTONES = 6
_MAX_ITEMS_PER_MILESTONE = 10

_GENERATE_PROMPT = """\
You are a principal engineer planning a technical roadmap for the repository portfolio below. \
You work only from this digest — do not assume facts it doesn't contain, and ground every \
item's rationale in it.

{goal_block}

## Portfolio digest
{digest}
{previous_block}
## Your job
1. **Assess** each repository on six dimensions, scored 1 (dire) to 10 (excellent): \
{dimensions}.
2. **Plan** 2-5 linear milestones, in execution order, that {plan_clause}. Each milestone has \
at most 10 items. An item is one concrete, actionable unit of work against exactly one \
repository (use `"repo": null` only for genuinely portfolio-wide items). Prefer small, \
independently shippable items.

Per item provide:
- `label`: one of {labels}
- `urgent` / `important`: the Eisenhower axes. urgent = delaying it is actively costly \
(security holes, blocking deprecations); important = it materially advances the goal or the \
portfolio's long-term health.
- `effort`: S (hours), M (a day or two), L (up to a week), XL (more than a week)
- `depends_on`: ids of items that must land first (only real technical ordering, not vibes)
- `description`: what to change and where — concrete enough that an engineer (or an agent) \
could start immediately
- `rationale`: the digest evidence that motivates this item

## Output
Return ONLY a single fenced json object as the very last thing, nothing else:
```json
{{
  "assessments": [
    {{
      "repo": "owner/name",
      "scores": {{"security": 7, "maintainability": 5, "dependency_freshness": 4, \
"test_confidence": 3, "activity": 8, "documentation": 5}},
      "summary": "1-2 sentences on this repo's overall state"
    }}
  ],
  "milestones": [
    {{
      "title": "short milestone name",
      "summary": "what this milestone achieves and why it comes at this point",
      "items": [
        {{
          "id": "i1",
          "repo": "owner/name",
          "title": "imperative item title",
          "description": "concrete, actionable description",
          "rationale": "evidence from the digest",
          "label": "security",
          "urgent": true,
          "important": true,
          "effort": "M",
          "depends_on": []
        }}
      ]
    }}
  ]
}}
```
Item `id`s (i1, i2, ...) must be unique across the whole document; `depends_on` may reference \
any item in any milestone."""

_GOAL_BLOCK = """\
## End goal
{goal}"""

_NO_GOAL_BLOCK = """\
## End goal
No explicit goal was set — derive the roadmap from the weaknesses, risks and opportunities \
visible in the digest (security exposure, decaying dependencies, missing tests, violated \
principles, maintenance debt)."""

_PREVIOUS_BLOCK = """
## Previous roadmap version
This is a re-plan. Work already completed (do NOT re-plan any of it):
{done_block}

Open items from the previous version — keep, rework or drop each on merit; re-emit the ones \
you keep as normal items:
{open_block}
"""


def build_generate_prompt(
    *,
    goal: str | None,
    digest: str,
    done_titles: list[str] | None = None,
    open_items: list[str] | None = None,
) -> str:
    goal_block = _GOAL_BLOCK.format(goal=goal.strip()) if goal and goal.strip() else _NO_GOAL_BLOCK
    plan_clause = (
        "move the portfolio toward the end goal step by step"
        if goal and goal.strip()
        else "most improve the portfolio's health and momentum"
    )
    previous_block = ""
    if done_titles or open_items:
        previous_block = _PREVIOUS_BLOCK.format(
            done_block="\n".join(f"- {t}" for t in (done_titles or [])) or "(none)",
            open_block="\n".join(f"- {t}" for t in (open_items or [])) or "(none)",
        )
    return _GENERATE_PROMPT.format(
        goal_block=goal_block,
        digest=digest,
        previous_block=previous_block,
        dimensions=", ".join(RADAR_DIMENSIONS),
        labels=", ".join(ITEM_LABELS),
        plan_clause=plan_clause,
    )


def slugify(title: str, *, max_length: int = 64) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return slug[:max_length].rstrip("-") or "item"


_EXECUTE_PROMPT = """\
You are implementing one roadmap item in the repository **{repo}**. You are working in a \
disposable git worktree on a dedicated branch — the platform commits, pushes and opens the \
pull request for you afterwards.

## The item
**{title}**  (label: {label})

{description_block}
{rationale_block}
## Hard rules
- Implement exactly this item — the smallest coherent change that completes it. Do not touch \
unrelated files, do not fix unrelated problems you notice.
- Follow the repository's existing conventions (style, structure, naming, test patterns).
- You cannot run commands — verify your work by reading the code you changed.
- Do NOT create commits or touch anything under .git — the platform handles all git operations.

## Output
When you are done, return ONLY a single fenced json object as the very last thing, nothing else:
```json
{{
  "summary": "2-4 sentences describing what you changed and why — this becomes the PR body",
  "changed_files": ["relative/path/one", "relative/path/two"],
  "notes": "anything the reviewer should double-check, or null"
}}
```"""


def build_execute_prompt(item: RoadmapItemRow, repo_slug: str) -> str:
    description_block = f"### What to do\n{item.description.strip()}\n" if item.description else ""
    rationale_block = f"### Why\n{item.rationale.strip()}\n" if item.rationale else ""
    return _EXECUTE_PROMPT.format(
        repo=repo_slug,
        title=item.title,
        label=item.label,
        description_block=description_block,
        rationale_block=rationale_block,
    )


def handle_roadmap_execute(job: JobRow) -> None:
    from shire.domain.roadmap.execution import (
        ExecutionError,
        cleanup_execution_worktree,
        finalize_execution,
    )
    from shire.domain.roadmap.models import RoadmapExecutionRow

    execution_id = uuid.UUID(job.payload["execution_id"])
    with unit_of_work() as session:
        execution = session.get(RoadmapExecutionRow, execution_id)
        if execution is None or execution.status != "pending":
            return  # item deleted, or already settled by an earlier dispatch

        now = datetime.now(UTC)
        execution.finished_at = now
        execution.duration_seconds = job.duration_seconds
        _copy_usage(execution, job.usage)

        item = session.get(RoadmapItemRow, execution.item_id)
        repo = (
            session.get(RepositoryRow, item.repository_id)
            if item is not None and item.repository_id is not None
            else None
        )

        try:
            if job.status != "succeeded":
                raise ExecutionError(job.error or "The execution job failed.")
            if item is None or repo is None:
                raise ExecutionError("The item or its repository disappeared mid-execution.")

            parsed = _parse_execution_output(job.result or "")
            execution.agent_summary = parsed["summary"]

            pr = finalize_execution(session, execution, item, repo)
            execution.pr_url = pr.url
            execution.pr_number = pr.number
            execution.pr_state = pr.state
            execution.status = "succeeded"
            # The item stays in_progress while its PR is open; the PR sweep completes it.
        except ExecutionError as exc:
            execution.status = "failed"
            execution.error = str(exc)[:4000]
            if item is not None and item.status == "in_progress":
                _transition_item(session, item, "todo", actor="system", now=now)
        except Exception:
            logger.exception("Unexpected failure settling roadmap execution %s", execution.id)
            execution.status = "failed"
            execution.error = "Unexpected failure while finalizing the execution."
            if item is not None and item.status == "in_progress":
                _transition_item(session, item, "todo", actor="system", now=now)
        finally:
            cleanup_execution_worktree(execution, repo)


_DRIFT_PROMPT = """\
You are auditing the roadmap for the repository **{repo}**. Below are the roadmap's open items \
for this repository. For each one, inspect the actual code (Read, Grep, Glob) and decide \
whether the plan still matches reality:

- `still_valid` — the work is still needed and not done.
- `appears_done` — the code shows this work has already been completed (perhaps outside the \
roadmap).
- `obsolete` — the premise no longer holds (the code it targets is gone, the problem was \
solved differently, the dependency was removed, ...).

## Open items
{items_block}

## Output
Return ONLY a single fenced json object as the very last thing, nothing else:
```json
{{
  "verdicts": [
    {{
      "item_id": "the exact id from the list above",
      "verdict": "still_valid" | "appears_done" | "obsolete",
      "evidence": "1-3 sentences citing the files you inspected"
    }}
  ]
}}
```
One verdict per item; base every verdict on code you actually opened."""


def build_drift_prompt(repo_slug: str, items: list[RoadmapItemRow]) -> str:
    lines = []
    for item in items:
        lines.append(f"- id: {item.id}")
        lines.append(f"  title: {item.title}  [{item.label}, {item.status}]")
        if item.description:
            lines.append(f"  description: {item.description[:400]}")
    return _DRIFT_PROMPT.format(repo=repo_slug, items_block="\n".join(lines))


def handle_roadmap_drift(job: JobRow) -> None:
    from shire.domain.roadmap.models import (
        DRIFT_VERDICTS,
        RoadmapDriftCheckRow,
        RoadmapDriftFindingRow,
    )

    check_id = uuid.UUID(job.payload["drift_check_id"])
    with unit_of_work() as session:
        check = session.get(RoadmapDriftCheckRow, check_id)
        if check is None or check.status != "pending":
            return  # roadmap deleted, or already settled by an earlier dispatch

        now = datetime.now(UTC)
        check.finished_at = now
        check.duration_seconds = job.duration_seconds

        # Staleness guard: the verdicts must describe the branch that was inspected.
        repo = session.get(RepositoryRow, check.repository_id)
        expected = job.payload.get("branch")
        if repo is None or (
            expected is not None and (repo.current_branch or repo.default_branch) != expected
        ):
            check.status = "error"
            check.error = "The repository's active branch changed while the check ran."
            return

        if job.status != "succeeded":
            check.status = "error"
            check.error = job.error or "The drift job failed."
            return

        verdicts = _parse_drift_verdicts(job.result or "")
        if verdicts is None:
            check.status = "error"
            check.error = "Could not parse the agent's structured verdicts."
            return

        item_ids = {uuid.UUID(i) for i in job.payload.get("item_ids") or []}
        for entry in verdicts:
            try:
                item_id = uuid.UUID(entry["item_id"])
            except ValueError:
                continue
            if item_id not in item_ids or entry["verdict"] not in DRIFT_VERDICTS:
                continue
            item = session.get(RoadmapItemRow, item_id)
            # Only non-trivial verdicts on still-open items need a decision.
            if item is None or entry["verdict"] == "still_valid" or item.status == "done":
                continue
            session.add(
                RoadmapDriftFindingRow(
                    drift_check_id=check.id,
                    item_id=item_id,
                    verdict=entry["verdict"],
                    evidence=entry.get("evidence"),
                    status="open",
                    created_at=now,
                )
            )
        check.status = "succeeded"


def _parse_drift_verdicts(text: str) -> list[dict] | None:
    block = _extract_json_object(text)
    if block is None:
        return None
    try:
        data = json.loads(block)
    except (json.JSONDecodeError, ValueError):
        return None
    raw = data.get("verdicts") if isinstance(data, dict) else None
    if not isinstance(raw, list):
        return None
    return [
        {
            "item_id": str(entry["item_id"]),
            "verdict": str(entry.get("verdict") or "").strip().lower(),
            "evidence": str(entry["evidence"]) if entry.get("evidence") else None,
        }
        for entry in raw
        if isinstance(entry, dict) and entry.get("item_id")
    ]


def _copy_usage(execution, usage: dict | None) -> None:
    if not isinstance(usage, dict):
        return
    if isinstance(usage.get("total_cost_usd"), (int, float)):
        execution.total_cost_usd = float(usage["total_cost_usd"])
    if isinstance(usage.get("input_tokens"), int):
        execution.input_tokens = usage["input_tokens"]
    if isinstance(usage.get("output_tokens"), int):
        execution.output_tokens = usage["output_tokens"]


def _transition_item(
    session: Session, item: RoadmapItemRow, status: str, *, actor: str, now: datetime
) -> None:
    version = session.get(RoadmapVersionRow, item.version_id)
    if version is not None:
        session.add(
            RoadmapItemEventRow(
                roadmap_id=version.roadmap_id,
                item_id=item.id,
                kind="status",
                from_value=item.status,
                to_value=status,
                actor=actor,
                created_at=now,
            )
        )
    item.status = status
    item.updated_at = now


def _parse_execution_output(text: str) -> dict:
    """{summary, changed_files, notes}. Lenient: a missing/garbled block falls back to prose."""
    block = _extract_json_object(text)
    if block is not None:
        try:
            data = json.loads(block)
        except (json.JSONDecodeError, ValueError):
            data = None
        if isinstance(data, dict) and data.get("summary"):
            notes = data.get("notes")
            return {
                "summary": str(data["summary"]),
                "changed_files": [str(f) for f in data.get("changed_files") or []],
                "notes": str(notes) if notes else None,
            }
    return {"summary": text.strip()[-2000:] or "(no summary)", "changed_files": [], "notes": None}


def handle_roadmap_generate(job: JobRow) -> None:
    version_id = uuid.UUID(job.payload["version_id"])
    with unit_of_work() as session:
        version = session.get(RoadmapVersionRow, version_id)
        if version is None or version.status != "pending":
            return  # roadmap deleted, or already settled by an earlier dispatch

        now = datetime.now(UTC)
        version.finished_at = now
        version.duration_seconds = job.duration_seconds

        if job.status != "succeeded":
            version.status = "error"
            version.error = job.error or "The generation job failed."
            return

        parsed = _parse_generation(job.result or "")
        if parsed is None or not parsed["milestones"]:
            version.status = "error"
            version.error = "Could not parse the agent's structured roadmap."
            return

        roadmap = session.get(RoadmapRow, version.roadmap_id)
        if roadmap is None:
            return

        repo_ids = _slug_to_repo_id(session, version)
        _materialize(session, roadmap, version, parsed, repo_ids, now)
        _carry_over(session, roadmap, version, now)

        version.assessments = _resolved_assessments(parsed["assessments"], repo_ids)
        version.status = "ready"
        roadmap.current_version_id = version.id
        roadmap.updated_at = now


def _slug_to_repo_id(session: Session, version: RoadmapVersionRow) -> dict[str, uuid.UUID]:
    """`owner/name` (lowercased) → repository id, for the repos this version was scoped to."""
    ids = [uuid.UUID(r) for r in version.repository_ids or []]
    rows = session.scalars(select(RepositoryRow).where(RepositoryRow.id.in_(ids)))
    return {f"{r.owner}/{r.name}".lower(): r.id for r in rows}


def _materialize(
    session: Session,
    roadmap: RoadmapRow,
    version: RoadmapVersionRow,
    parsed: dict,
    repo_ids: dict[str, uuid.UUID],
    now: datetime,
) -> None:
    """Turn the parsed document into milestone/item/dependency/event rows."""
    temp_ids: dict[str, uuid.UUID] = {}
    deps: list[tuple[str, str]] = []  # (item temp id, depends-on temp id)
    slugs_seen: set[str] = set()

    for m_pos, milestone in enumerate(parsed["milestones"][:_MAX_MILESTONES]):
        m_row = RoadmapMilestoneRow(
            version_id=version.id,
            position=m_pos,
            title=milestone["title"][:200],
            summary=milestone.get("summary"),
        )
        session.add(m_row)
        session.flush()

        for i_pos, item in enumerate(milestone["items"][:_MAX_ITEMS_PER_MILESTONE]):
            slug = slugify(item["title"])
            n = 2
            while slug in slugs_seen:
                slug = f"{slugify(item['title'])}-{n}"
                n += 1
            slugs_seen.add(slug)

            row = RoadmapItemRow(
                version_id=version.id,
                milestone_id=m_row.id,
                repository_id=repo_ids.get((item.get("repo") or "").lower()),
                position=i_pos,
                slug=slug,
                title=item["title"][:300],
                description=item.get("description"),
                rationale=item.get("rationale"),
                label=item["label"],
                urgent=bool(item.get("urgent")),
                important=bool(item.get("important")),
                effort=item.get("effort"),
                status="todo",
                created_at=now,
                updated_at=now,
            )
            session.add(row)
            session.flush()
            session.add(
                RoadmapItemEventRow(
                    roadmap_id=roadmap.id,
                    item_id=row.id,
                    kind="created",
                    to_value="todo",
                    actor="ai",
                    created_at=now,
                )
            )
            if temp_id := item.get("id"):
                temp_ids[str(temp_id)] = row.id
            deps += [(str(temp_id), str(d)) for d in item.get("depends_on") or []]

    _insert_dependencies(session, temp_ids, deps)


def _insert_dependencies(
    session: Session, temp_ids: dict[str, uuid.UUID], deps: list[tuple[str, str]]
) -> None:
    """Resolve temp ids and insert edges, skipping unknowns, self-loops and cycle-closers."""
    adjacency: dict[uuid.UUID, set[uuid.UUID]] = {}

    def reaches(start: uuid.UUID, target: uuid.UUID) -> bool:
        stack, visited = [start], set()
        while stack:
            node = stack.pop()
            if node == target:
                return True
            if node in visited:
                continue
            visited.add(node)
            stack.extend(adjacency.get(node, ()))
        return False

    seen: set[tuple[uuid.UUID, uuid.UUID]] = set()
    for item_temp, dep_temp in deps:
        item_id, dep_id = temp_ids.get(item_temp), temp_ids.get(dep_temp)
        if item_id is None or dep_id is None or item_id == dep_id:
            continue
        if (item_id, dep_id) in seen or reaches(dep_id, item_id):
            continue  # duplicate, or this edge would close a cycle
        seen.add((item_id, dep_id))
        adjacency.setdefault(item_id, set()).add(dep_id)
        session.add(
            RoadmapItemDependencyRow(item_id=item_id, depends_on_item_id=dep_id, created_by="ai")
        )


def _carry_over(
    session: Session, roadmap: RoadmapRow, version: RoadmapVersionRow, now: datetime
) -> None:
    """Copy the previous ready version's finished work into this one.

    `done` items carry as the completion record; in-progress items with an open PR carry
    because that PR must still auto-complete them when it merges.
    """
    previous = session.scalars(
        select(RoadmapVersionRow)
        .where(
            RoadmapVersionRow.roadmap_id == roadmap.id,
            RoadmapVersionRow.status == "ready",
            RoadmapVersionRow.id != version.id,
        )
        .order_by(RoadmapVersionRow.number.desc())
        .limit(1)
    ).first()
    if previous is None:
        return

    from shire.domain.roadmap.models import RoadmapExecutionRow

    candidates = session.scalars(
        select(RoadmapItemRow).where(
            RoadmapItemRow.version_id == previous.id,
            RoadmapItemRow.status.in_(("done", "in_progress")),
        )
    ).all()

    def latest_execution(item_id: uuid.UUID) -> RoadmapExecutionRow | None:
        return session.scalars(
            select(RoadmapExecutionRow)
            .where(RoadmapExecutionRow.item_id == item_id)
            .order_by(RoadmapExecutionRow.created_at.desc())
            .limit(1)
        ).first()

    for old in candidates:
        execution = latest_execution(old.id) if old.status == "in_progress" else None
        # In-progress items carry only when a live PR still has to auto-complete them;
        # everything else in flight gets re-planned by the new version.
        if old.status == "in_progress" and (execution is None or execution.pr_state != "open"):
            continue
        row = RoadmapItemRow(
            version_id=version.id,
            milestone_id=None,
            repository_id=old.repository_id,
            position=old.position,
            slug=old.slug,
            title=old.title,
            description=old.description,
            rationale=old.rationale,
            label=old.label,
            urgent=old.urgent,
            important=old.important,
            effort=old.effort,
            status=old.status,
            carried_from_item_id=old.id,
            issue_url=old.issue_url,
            created_at=now,
            updated_at=now,
        )
        session.add(row)
        session.flush()
        session.add(
            RoadmapItemEventRow(
                roadmap_id=roadmap.id,
                item_id=row.id,
                kind="carried",
                from_value=old.status,
                to_value=old.status,
                actor="system",
                created_at=now,
            )
        )
        # The open PR must still auto-complete the *carried* item when it merges, so its
        # newest execution (the PR pointer) follows the item into the new version.
        if execution is not None:
            execution.item_id = row.id


def _resolved_assessments(assessments: list[dict], repo_ids: dict[str, uuid.UUID]) -> list[dict]:
    resolved = []
    for entry in assessments:
        repo_id = repo_ids.get((entry.get("repo") or "").lower())
        resolved.append(
            {
                "repo": entry.get("repo"),
                "repository_id": str(repo_id) if repo_id else None,
                "scores": entry["scores"],
                "summary": entry.get("summary"),
            }
        )
    return resolved


# --- parsing ---------------------------------------------------------------------------


def _parse_generation(text: str) -> dict | None:
    """{assessments: [...], milestones: [...]} with every invalid entry dropped, not fatal."""
    block = _extract_json_object(text)
    if block is None:
        return None
    try:
        data = json.loads(block)
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(data, dict):
        return None

    milestones = []
    for m in data.get("milestones") or []:
        if not isinstance(m, dict) or not m.get("title"):
            continue
        items = []
        for entry in m.get("items") or []:
            item = _parse_item(entry)
            if item is not None:
                items.append(item)
        if items:
            milestones.append(
                {
                    "title": str(m["title"]),
                    "summary": str(m["summary"]) if m.get("summary") else None,
                    "items": items,
                }
            )

    assessments = []
    for a in data.get("assessments") or []:
        if not isinstance(a, dict) or not isinstance(a.get("scores"), dict):
            continue
        scores = {
            dim: max(1, min(10, int(value)))
            for dim, value in a["scores"].items()
            if dim in RADAR_DIMENSIONS and isinstance(value, (int, float))
        }
        if not scores:
            continue
        assessments.append(
            {
                "repo": str(a["repo"]) if a.get("repo") else None,
                "scores": scores,
                "summary": str(a["summary"]) if a.get("summary") else None,
            }
        )

    return {"assessments": assessments, "milestones": milestones}


def _parse_item(entry: object) -> dict | None:
    if not isinstance(entry, dict) or not entry.get("title"):
        return None
    label = str(entry.get("label") or "").strip().lower()
    if label not in ITEM_LABELS:
        label = "improvement"
    effort = str(entry.get("effort") or "").strip().upper()
    depends_on = entry.get("depends_on")
    return {
        "id": str(entry["id"]) if entry.get("id") else None,
        "repo": str(entry["repo"]) if entry.get("repo") else None,
        "title": str(entry["title"]),
        "description": str(entry["description"]) if entry.get("description") else None,
        "rationale": str(entry["rationale"]) if entry.get("rationale") else None,
        "label": label,
        "urgent": bool(entry.get("urgent")),
        "important": bool(entry.get("important")),
        "effort": effort if effort in ITEM_EFFORTS else None,
        "depends_on": [str(d) for d in depends_on] if isinstance(depends_on, list) else [],
    }


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
