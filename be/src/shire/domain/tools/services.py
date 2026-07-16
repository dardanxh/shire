"""Tools-catalog service: read the persisted catalog (fast) or re-probe + persist (sync)."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from shire.domain.tools.install import (
    install_state,
    installer_for,
    installer_present,
    start_install,
)
from shire.domain.tools.models import ToolRow
from shire.domain.tools.repositories import SqlToolRepository
from shire.domain.tools.schemas import ToolStatusResult
from shire.integrations.external_tools import all_tool_statuses, binary_tool_by_id


class ToolService:
    def __init__(self, session: Session) -> None:
        self._repos = SqlToolRepository(session)

    def list_tools(self) -> list[ToolStatusResult]:
        """Read the persisted catalog. Lazily seeds it once if the table is empty (first run)."""
        if self._repos.count() == 0:
            return self.sync_tools()
        return [self._with_install_overlay(row) for row in self._repos.list_all()]

    def install_tool(self, tool_id: str) -> ToolStatusResult:
        """Kick off the curated background install and return the overlaid row (202 semantics)."""
        start_install(tool_id)
        # start_install validated the id against the adapter registry, so at worst the
        # persisted catalog lags one sync behind — refresh it in that case.
        results = self.list_tools()
        match = next((r for r in results if r.id == tool_id), None)
        if match is None:
            match = next(r for r in self.sync_tools() if r.id == tool_id)
        return match

    def _with_install_overlay(self, row: ToolRow) -> ToolStatusResult:
        result = ToolStatusResult.model_validate(row)
        adapter = binary_tool_by_id().get(row.id)
        if adapter is None:
            return result  # bundled library tools: always available, never installable
        installer = installer_for(adapter)
        state = install_state(row.id)
        return result.model_copy(
            update={
                "installer": installer,
                "installable": (
                    not row.available and installer is not None and installer_present(installer)
                ),
                "install_status": state.status if state else "idle",
                "install_error": state.error if state else None,
            }
        )

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
        return [self._with_install_overlay(row) for row in rows]
