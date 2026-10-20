"""Completion handler for `mcp.probe`: replace the server snapshot with what the probe saw."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

from shire.core.db import unit_of_work
from shire.domain.jobs.models import JobRow
from shire.domain.mcp.domain import parse_mcp_list, server_tool_prefix
from shire.domain.mcp.models import McpServerRow
from shire.domain.mcp.repositories import SqlMcpServerRepository

logger = logging.getLogger(__name__)


def handle_mcp_probe(job: JobRow) -> None:
    if job.status != "succeeded":
        return  # the failed job itself (status + error) is what the Home card reports
    try:
        data = json.loads(job.result or "{}")
    except json.JSONDecodeError:
        logger.warning("mcp.probe job %s returned non-JSON output", job.id)
        return
    servers = parse_mcp_list(data.get("list_output") or "")
    tools: list[str] = [t for t in data.get("tools") or [] if isinstance(t, str)]
    # Only trust an enumeration that actually ran; a failed listing keeps the previous tools.
    enumerated = data.get("tools_error") is None
    now = datetime.now(UTC)
    with unit_of_work() as session:
        repo = SqlMcpServerRepository(session)
        for server in servers:
            prefix = server_tool_prefix(server.name) + "__"
            row = repo.get(server.name)
            if row is None:
                row = McpServerRow(name=server.name, tools=[])
                repo.add(row)
            row.target = server.target[:2048]
            row.status = server.status
            row.status_detail = server.status_detail
            row.checked_at = now
            server_tools = [t for t in tools if t.startswith(prefix)]
            if enumerated and (server_tools or server.status != "connected"):
                row.tools = server_tools
        repo.delete_except([s.name for s in servers])
