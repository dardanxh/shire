"""Prompt builder + completion handler for compliance check jobs.

The prompt embeds the regulation's key articles so the agent assesses the repository
against concrete requirements. The handler persists the parsed verdict onto the
check row — code-level observations only, explicitly not legal advice.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime

from shire.core.db import unit_of_work
from shire.domain.compliance.models import ComplianceCheckRow
from shire.domain.jobs.models import JobRow
from shire.domain.security.models import DataRegulationRow

logger = logging.getLogger(__name__)

# Keep the embedded article digest well under the engine context budget.
_ARTICLES_CHAR_BUDGET = 9_000

_CHECK_PROMPT = """\
You are performing a CODE-LEVEL compliance review of the repository **{repo}** against \
**{regulation}** ({full_name}). Explore the real code with your Read, Grep and Glob tools \
before you conclude anything: data models and migrations, API routes, auth/access control, \
encryption and secrets handling, logging, data retention/deletion paths, third-party data \
flows, and configuration.

Regulation overview: {description}

Key requirements to assess against:
{articles}

Assess ONLY what is observable in the code and configuration. This is engineering signal, \
not legal advice — judge whether the codebase shows the technical practices these \
requirements imply (or whether the regulation clearly doesn't apply to what this code does).

Return ONLY a single fenced json object as the very last thing, nothing else:
```json
{{
  "verdict": "compliant | partial | non_compliant | not_applicable",
  "summary": "3-5 sentences: the overall picture and the biggest gaps",
  "findings": [
    {{
      "title": "short finding title",
      "status": "ok | gap | unclear",
      "note": "1-3 sentences with concrete file/code evidence",
      "article_ref": "the requirement ref this maps to, if any"
    }}
  ]
}}
```"""

_VERDICTS = {"compliant", "partial", "non_compliant", "not_applicable"}
_FINDING_STATUSES = {"ok", "gap", "unclear"}


def build_check_prompt(regulation: DataRegulationRow, repo_slug: str) -> str:
    lines: list[str] = []
    total = 0
    articles = regulation.articles or []
    # Key articles first, then the rest, until the char budget runs out.
    ordered = [a for a in articles if a.get("is_key")] + [
        a for a in articles if not a.get("is_key")
    ]
    for article in ordered:
        requirements = article.get("key_requirements") or []
        summary = article.get("summary") or ""
        block = f"- [{article.get('number', '?')}] {article.get('title', '')}: {summary}"
        for requirement in requirements:
            block += f"\n  - {requirement}"
        if total + len(block) > _ARTICLES_CHAR_BUDGET:
            break
        lines.append(block)
        total += len(block)
    if not lines:
        lines.append(f"- {regulation.description}")
    return _CHECK_PROMPT.format(
        repo=repo_slug,
        regulation=regulation.name,
        full_name=regulation.full_name,
        description=regulation.description,
        articles="\n".join(lines),
    )


def handle_compliance_check(job: JobRow) -> None:
    check_id = uuid.UUID(job.payload["check_id"])
    with unit_of_work() as session:
        row = session.get(ComplianceCheckRow, check_id)
        if row is None:
            return  # check was deleted meanwhile — nothing to persist
        row.finished_at = datetime.now(UTC)
        if job.status != "succeeded":
            row.status = "failed"
            row.error = job.error or "The engine job did not succeed."
            return
        parsed = _parse_check(job.result or "")
        if parsed is None:
            row.status = "failed"
            row.error = "The agent did not return a usable compliance assessment."
            return
        row.status = "done"
        row.verdict = parsed["verdict"]
        row.summary = parsed["summary"]
        row.findings = parsed["findings"]


def _parse_check(text: str) -> dict | None:
    from shire.domain.substrate.services import _extract_json_object

    block = _extract_json_object(text)
    if block is None:
        return None
    try:
        data = json.loads(block)
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    verdict = str(data.get("verdict") or "").strip()
    if verdict not in _VERDICTS:
        return None
    findings: list[dict] = []
    for raw in data.get("findings") or []:
        if not isinstance(raw, dict) or not raw.get("title"):
            continue
        status = str(raw.get("status") or "unclear")
        findings.append(
            {
                "title": str(raw["title"]),
                "status": status if status in _FINDING_STATUSES else "unclear",
                "note": str(raw.get("note") or ""),
                "article_ref": str(raw["article_ref"]) if raw.get("article_ref") else None,
            }
        )
    return {
        "verdict": verdict,
        "summary": str(data.get("summary") or ""),
        "findings": findings,
    }
