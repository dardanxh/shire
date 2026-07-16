"""Tools-catalog service: read the persisted catalog (fast) or re-probe + persist (sync)."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from shire.domain.tools.models import ToolRow
from shire.domain.tools.repositories import SqlToolRepository
from shire.domain.tools.schemas import ToolStatusResult
from shire.integrations.external_tools import all_tool_statuses


class ToolService:
    def __init__(self, session: Session) -> None:
        self._repos = SqlToolRepository(session)

    def list_tools(self) -> list[ToolStatusResult]:
        """Read the persisted catalog. Lazily seeds it once if the table is empty (first run)."""
        if self._repos.count() == 0:
            return self.sync_tools()
        return [ToolStatusResult.model_validate(row) for row in self._repos.list_all()]

    def sync_tools(self) -> list[ToolStatusResult]:
        """Re-probe every tool (parallelized) and replace the stored catalog."""
        now = datetime.now(UTC)
        rows = [
            ToolRow(
                id=status.id,
                name=status.name,
                available=status.available,
                version=status.version,
                purpose=status.purpose,
                install=status.install,
                homepage=status.homepage,
                category=status.category,
                kind=status.kind,
                language=status.language,
                position=index,
                synced_at=now,
            )
            for index, status in enumerate(all_tool_statuses())
        ]
        self._repos.replace_all(rows)
        return [ToolStatusResult.model_validate(row) for row in rows]
