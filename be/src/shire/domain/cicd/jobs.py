"""Prompt builders, output parsers, and completion handlers for CI/CD engine jobs.

The scan job is read-only analysis of the clone. The apply job writes inside a disposable
worktree; its handler commits and then KEEPS the `cicd/*` branch while removing the worktree —
the branch is the deliverable (no push, no PR), exactly as the AI-readiness apply run behaves.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime
from pathlib import Path

from shire.core.db import unit_of_work
from shire.domain.cicd.models import CicdExecutionRow, CicdSuggestionRow
from shire.domain.cicd.schemas import (
    EFFORTS,
    ENVIRONMENT_KINDS,
    IMPACTS,
    SUGGESTION_CATEGORIES,
    CicdEnvironment,
    CicdPipeline,
    CicdTransition,
)
from shire.domain.jobs.models import JobRow
from shire.domain.repository.models import RepositoryRow
from shire.integrations.git_worktree import commit_all, remove_worktree

logger = logging.getLogger(__name__)

_SCAN_PROMPT = """\
You are mapping the CI/CD of repository **{repo}**: what it does today, which long-living \
environments it deploys to, and how a change is promoted between them.

Only these platforms count: GitHub Actions, GitLab CI, Bitbucket Pipelines. If the repository \
uses something else (Jenkins, CircleCI, Azure Pipelines, Drone), ignore it.

Pipeline files detected by filename:
{files}
There may be more — reusable workflows, `include:`d templates, `extends`, composite actions and \
matrix-generated jobs are exactly what a filename list cannot resolve. Verify and go beyond it.

Work with Glob, Grep and Read:
1. Read every pipeline file end to end, following includes/reusable-workflow references.
2. Work out the LONG-LIVING environments: the ones tied to a branch or environment name that \
persists (main/master, develop, qa, staging, uat, release/*). A per-PR or per-commit preview \
deployment is NOT a long-living environment — mention it in the summary instead.
3. For each environment, record the branch that feeds it, what it deploys to, what triggers the \
deploy, and any gates (manual approval, protected environment, required reviewers).
4. Work out how a change PROPAGATES: one transition per hop (dev -> qa, qa -> main, ...), with \
the trigger that starts it and the short names of the steps that run.
5. Note the pipelines themselves: file, name, what triggers them, their job names.

Rules:
- Ground every environment and transition in a real pipeline file and put that path in \
`source_file`. Invent nothing — if the config doesn't say it, leave the field empty.
- `kind` is one of: {kinds}.
- `steps` are SHORT names as they appear in the config ("build", "lint", "test", \
"publish image", "deploy"); at most 8 per transition, in execution order.
- `trigger` is a short human phrase: "merge to develop", "PR to main", "tag v*", "manual", \
"nightly schedule".
- `summary` is 3-6 sentences of plain prose for someone who has never seen this repository: \
what the CI/CD actually does, in what order, and anything surprising.
- Then propose 4-10 improvements, most valuable first: faster (caching, artifact reuse, \
parallelism, skipping unaffected work), simpler (duplication that belongs in a reusable \
workflow/composite action/`extends`/anchors, dead pipelines), and safer (pinned versions, \
least-privilege tokens). Each one must name the file(s) it touches in `paths` and be specific \
enough to implement. `category` is one of: {categories}. `impact` and `effort` are one of: \
{impacts}.
- If this repository has no usable CI/CD for the three platforms, return empty lists and say so \
in one sentence in `summary`.

Return ONLY a single fenced json object as the very last thing, nothing else:
```json
{{
  "platforms": ["github_actions"],
  "summary": "3-6 sentences of plain prose.",
  "environments": [
    {{
      "key": "prod",
      "name": "Production",
      "kind": "prod",
      "branch": "main",
      "deploy_target": "ECS cluster shire-prod",
      "trigger": "merge to main",
      "gates": ["manual approval"],
      "auto_deploy": false,
      "notes": "",
      "source_file": ".github/workflows/deploy.yml"
    }}
  ],
  "transitions": [
    {{
      "from_env": "qa",
      "to_env": "prod",
      "trigger": "merge to main",
      "steps": ["build", "test", "publish image", "deploy"],
      "gates": ["manual approval"],
      "source_file": ".github/workflows/deploy.yml"
    }}
  ],
  "pipelines": [
    {{
      "file": ".github/workflows/ci.yml",
      "name": "CI",
      "triggers": ["pull_request", "push to main"],
      "jobs": ["lint", "test", "build"]
    }}
  ],
  "suggestions": [
    {{
      "category": "caching",
      "impact": "high",
      "effort": "low",
      "title": "Cache pnpm downloads in the UI job",
      "detail": "2-4 sentences: what to change and why it pays off here.",
      "paths": [".github/workflows/ci.yml"]
    }}
  ]
}}
```"""

_APPLY_PROMPT = """\
You are improving the CI/CD of repository **{repo}** by implementing the accepted suggestions \
below. You are working in a disposable git worktree on a dedicated branch — the platform commits \
for you afterwards.

Implement each suggestion exactly, editing ONLY the pipeline files it lists (plus a new reusable \
workflow / composite action / template file when the suggestion explicitly calls for one):
{suggestions}

Hard rules:
- Read each file before you change it and keep the existing style (indentation, quoting, job \
naming, ordering).
- Do NOT change what the pipelines are triggered by, and do NOT change which environments they \
deploy to, unless the suggestion is explicitly about that.
- Never invent secret names, variable names, runner labels or image tags — reuse the ones already \
present in the repository.
- Keep the YAML valid. You cannot run commands — verify your work by re-reading what you wrote.
- Do NOT create commits or touch anything under .git.

Return ONLY a single fenced json object as the very last thing, nothing else:
```json
{{
  "summary": "2-4 sentences: what changed and what it buys.",
  "changed_files": [".github/workflows/ci.yml"]
}}
```"""


def build_scan_prompt(repo_slug: str, files: list[tuple[str, str]]) -> str:
    listing = "\n".join(f"- {path} ({system})" for path, system in files)
    return _SCAN_PROMPT.format(
        repo=repo_slug,
        files=listing or "- (none detected by filename — search for them yourself)",
        kinds=", ".join(ENVIRONMENT_KINDS),
        categories=", ".join(SUGGESTION_CATEGORIES),
        impacts=", ".join(IMPACTS),
    )


def build_apply_prompt(repo_slug: str, rows: list[CicdSuggestionRow]) -> str:
    listing = "\n".join(
        f"- [{row.category}] {row.title} (files: {', '.join(row.paths) or 'decide from the repo'})"
        f"\n  {row.detail}"
        for row in rows
    )
    return _APPLY_PROMPT.format(repo=repo_slug, suggestions=listing)


# --- parsing ------------------------------------------------------------------


def _load_json_object(text: str) -> dict | None:
    from shire.domain.substrate.services import _extract_json_object

    block = _extract_json_object(text)
    if block is None:
        return None
    try:
        data = json.loads(block)
    except (json.JSONDecodeError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def _clean(value: object, limit: int) -> str:
    return "" if value is None else str(value).strip()[:limit]


def _str_list(value: object, *, limit: int = 120, max_items: int = 12) -> list[str]:
    if not isinstance(value, list):
        return []
    out = [_clean(item, limit) for item in value if isinstance(item, str | int | float)]
    return [item for item in out if item][:max_items]


def parse_suggestions(text: str) -> list[dict] | None:
    """The suggestion array out of an agent answer — `None` when there is no usable JSON at all.

    Shared by the scan handler and the `ci-cd` hobit bridge, which asks for the same array inside
    the hobit output contract's final JSON block.
    """
    data = _load_json_object(text)
    if data is None:
        return None
    raw_items = data.get("suggestions")
    if not isinstance(raw_items, list):
        return None
    items: list[dict] = []
    for raw in raw_items:
        if not isinstance(raw, dict):
            continue
        title = _clean(raw.get("title"), 200)
        if not title:
            continue
        category = _clean(raw.get("category"), 24)
        impact = _clean(raw.get("impact"), 8)
        effort = _clean(raw.get("effort"), 8)
        items.append(
            {
                "category": category if category in SUGGESTION_CATEGORIES else "practice",
                "impact": impact if impact in IMPACTS else "medium",
                "effort": effort if effort in EFFORTS else "medium",
                "title": title,
                "detail": _clean(raw.get("detail"), 4000),
                "paths": _str_list(raw.get("paths"), limit=300, max_items=10),
            }
        )
    return items


def parse_scan(text: str) -> dict | None:
    """The engine's CI/CD map: platforms, prose summary, environments, transitions, pipelines and
    first-pass suggestions. `None` = unusable output; empty collections are a legitimate answer
    for a repository with no CI/CD on the three platforms we cover."""
    data = _load_json_object(text)
    if data is None:
        return None
    if not isinstance(data.get("summary"), str):
        return None

    environments: list[CicdEnvironment] = []
    seen_keys: set[str] = set()
    for raw in data.get("environments") or []:
        if not isinstance(raw, dict):
            continue
        name = _clean(raw.get("name"), 120) or _clean(raw.get("key"), 60)
        key = (_clean(raw.get("key"), 60) or name).lower().replace(" ", "-")
        if not key or key in seen_keys:
            continue
        seen_keys.add(key)
        kind = _clean(raw.get("kind"), 12)
        environments.append(
            CicdEnvironment(
                key=key,
                name=name or key,
                kind=kind if kind in ENVIRONMENT_KINDS else "other",
                branch=_clean(raw.get("branch"), 160),
                deploy_target=_clean(raw.get("deploy_target"), 200),
                trigger=_clean(raw.get("trigger"), 200),
                gates=_str_list(raw.get("gates")),
                auto_deploy=bool(raw.get("auto_deploy")),
                notes=_clean(raw.get("notes"), 600),
                source_file=_clean(raw.get("source_file"), 300),
            )
        )

    transitions: list[CicdTransition] = []
    for raw in data.get("transitions") or []:
        if not isinstance(raw, dict):
            continue
        from_env = _clean(raw.get("from_env"), 60).lower().replace(" ", "-")
        to_env = _clean(raw.get("to_env"), 60).lower().replace(" ", "-")
        # A transition that doesn't connect two known environments has nothing to draw.
        if from_env not in seen_keys or to_env not in seen_keys or from_env == to_env:
            continue
        transitions.append(
            CicdTransition(
                from_env=from_env,
                to_env=to_env,
                trigger=_clean(raw.get("trigger"), 200),
                steps=_str_list(raw.get("steps"), limit=60, max_items=8),
                gates=_str_list(raw.get("gates")),
                source_file=_clean(raw.get("source_file"), 300),
            )
        )

    pipelines: list[CicdPipeline] = []
    for raw in data.get("pipelines") or []:
        if not isinstance(raw, dict):
            continue
        file = _clean(raw.get("file"), 300)
        if not file:
            continue
        pipelines.append(
            CicdPipeline(
                file=file,
                name=_clean(raw.get("name"), 120),
                triggers=_str_list(raw.get("triggers")),
                jobs=_str_list(raw.get("jobs"), limit=80, max_items=40),
            )
        )

    return {
        "platforms": _str_list(data.get("platforms"), limit=32, max_items=6),
        "summary": _clean(data.get("summary"), 4000),
        "environments": environments,
        "transitions": transitions,
        "pipelines": pipelines,
        "suggestions": parse_suggestions(text) or [],
    }


# --- completion handlers ------------------------------------------------------


def handle_cicd_scan(job: JobRow) -> None:
    """Replace the repository's CI/CD map (and the scan's proposals) with what came back."""
    if not _branch_still_active(job):
        _mark_failed(job.id, "The repository's active branch changed since this job was queued.")
        return
    if job.status != "succeeded":
        return  # the job row already carries the error
    parsed = parse_scan(job.result or "")
    if parsed is None:
        _mark_failed(job.id, "The agent did not return a parseable CI/CD map.")
        return
    repository_id = uuid.UUID(job.payload["repository_id"])
    with unit_of_work() as session:
        # Deferred import: the service imports this module for its prompt builders.
        from shire.domain.cicd.services import CicdService

        CicdService(session).apply_scan(repository_id, job, parsed)
    logger.info(
        "CI/CD scan %s: %d environments, %d transitions, %d suggestions",
        job.id,
        len(parsed["environments"]),
        len(parsed["transitions"]),
        len(parsed["suggestions"]),
    )


def handle_cicd_apply(job: JobRow) -> None:
    """Commit whatever the agent wrote in the worktree and keep the branch as the deliverable."""
    execution_id = uuid.UUID(job.payload["execution_id"])
    with unit_of_work() as session:
        execution = session.get(CicdExecutionRow, execution_id)
        if execution is None or execution.status != "pending":
            return
        repo = session.get(RepositoryRow, uuid.UUID(job.payload["repository_id"]))
        clone = Path(repo.clone_path) if repo and repo.clone_path else None
        worktree = Path(execution.worktree_path) if execution.worktree_path else None
        execution.finished_at = datetime.now(UTC)

        def _cleanup(keep_branch: bool) -> None:
            if clone is None or worktree is None:
                return
            branch = None if keep_branch else execution.branch
            try:
                remove_worktree(clone, worktree, branch)
            except Exception:
                logger.warning("Worktree cleanup failed for CI/CD execution %s", execution.id)
            execution.worktree_path = None

        if job.status != "succeeded":
            execution.status = "failed"
            execution.error = job.error or "The engine job did not succeed."
            _cleanup(keep_branch=False)
            return
        if worktree is None or not worktree.is_dir():
            execution.status = "failed"
            execution.error = "The execution worktree is gone."
            _cleanup(keep_branch=False)
            return

        commit_sha = commit_all(worktree, "CI/CD: implement Shire suggestions")
        if commit_sha is None:
            execution.status = "failed"
            execution.error = "The agent finished without changing any files."
            _cleanup(keep_branch=False)
            return

        parsed = _load_json_object(job.result or "") or {}
        execution.status = "succeeded"
        execution.commit_sha = commit_sha
        execution.agent_summary = _clean(parsed.get("summary"), 4000)
        execution.changed_files = _str_list(parsed.get("changed_files"), limit=300, max_items=40)
        for raw_id in execution.suggestion_ids:
            row = session.get(CicdSuggestionRow, uuid.UUID(raw_id))
            if row is not None:
                row.status = "applied"
                row.execution_id = execution.id
        # The branch IS the deliverable — remove the worktree, keep the branch.
        _cleanup(keep_branch=True)


def _branch_still_active(job: JobRow) -> bool:
    """Staleness guard: a scan queued for one branch must not overwrite the map after the repo
    switched to another."""
    expected = job.payload.get("branch")
    if expected is None:
        return True
    with unit_of_work() as session:
        row = session.get(RepositoryRow, uuid.UUID(job.payload["repository_id"]))
        if row is None:
            return False
        return (row.current_branch or row.default_branch) == expected


def _mark_failed(job_id: uuid.UUID, reason: str) -> None:
    """A succeeded engine run whose output is unusable is, for observability, a failed job."""
    with unit_of_work() as session:
        row = session.get(JobRow, job_id)
        if row is not None:
            row.status = "failed"
            row.error = reason
