"""MCP service: the probe snapshot, probe enqueueing, and host-runner liveness."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session

from shire.core.pagination import PaginationParams
from shire.domain.jobs import kinds as job_kinds
from shire.domain.jobs.schemas import JobResult
from shire.domain.jobs.services import JobService
from shire.domain.mcp.repositories import SqlMcpServerRepository
from shire.domain.mcp.schemas import McpServerResult, McpServersResult

# Set by scripts/host-runner.sh (ENGINE_APPLICATION_NAME) on every connection it opens.
HOST_RUNNER_APPLICATION_NAME = "shire-host-runner"

_PROBE_TIMEOUT_SECONDS = 420


class McpService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._servers = SqlMcpServerRepository(session)
        self._jobs = JobService(session)

    def host_runner_running(self) -> bool:
        return bool(
            self._session.execute(
                text("SELECT count(*) FROM pg_stat_activity WHERE application_name = :name"),
                {"name": HOST_RUNNER_APPLICATION_NAME},
            ).scalar()
        )

    def servers(self) -> McpServersResult:
        rows = self._servers.list()
        probe = self._latest_probe()
        return McpServersResult(
            servers=[McpServerResult.of(r) for r in rows],
            checked_at=max((r.checked_at for r in rows), default=None),
            probe_job_id=probe.id if probe else None,
            probe_status=probe.status if probe else None,
            probe_error=probe.error if probe else None,
            host_runner_running=self.host_runner_running(),
        )

    def tools_by_server(self) -> dict[str, list[str]]:
        return {r.name: list(r.tools or []) for r in self._servers.list()}

    def has_probe_data(self) -> bool:
        return bool(self._servers.list())

    def refresh(self) -> McpServersResult:
        self.enqueue_probe()
        return self.servers()

    def enqueue_probe(self) -> None:
        """Queue a probe unless one is already waiting or running."""
        latest = self._latest_probe()
        if latest is not None and latest.status in ("pending", "running"):
            return
        self._jobs.enqueue(
            kind=job_kinds.MCP_PROBE,
            title="Probe MCP servers",
            prompt="mcp probe",
            payload={
                "model": self._jobs.light_model(),
                "timeout_seconds": _PROBE_TIMEOUT_SECONDS,
            },
        )

    def _latest_probe(self) -> JobResult | None:
        page = self._jobs.list(PaginationParams(page=1, page_size=1), kind=job_kinds.MCP_PROBE)
        return page.items[0] if page.items else None
