"""The one-click tool installer: curated commands, run in a background thread.

Safety model: the ONLY commands that can ever run are the hardcoded `install_argv` sequences
on each adapter's ToolSpec — `tool_id` merely selects among them, no user input reaches a
process, and nothing goes through a shell. Installs are best-effort by design (Homebrew and
npm fail for machine-specific reasons); the UI always shows the manual command as fallback.

State lives in memory ON PURPOSE: the catalog sync does `replace_all()` (persisted install
columns would be wiped by any sync), and a thread's outcome dies with the process anyway —
memory reflects reality. A restart simply forgets in-flight installs; the stale guard below
reports those as failed.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import threading
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

from shire.core.exceptions import ConflictError, NotFoundError
from shire.integrations.external_tools import ExternalTool, binary_tool_by_id

logger = logging.getLogger(__name__)

_COMMAND_TIMEOUT_SECONDS = 600
_STALE_AFTER = timedelta(minutes=15)
_ERROR_TAIL_CHARS = 2000

InstallStatus = Literal["running", "succeeded", "failed"]


@dataclass
class InstallState:
    status: InstallStatus
    error: str | None
    started_at: datetime


_states: dict[str, InstallState] = {}
_lock = threading.Lock()


def installer_for(adapter: ExternalTool) -> str | None:
    """The runner binary ("brew" / "uv" / "npm") behind a tool's one-click install."""
    argv = adapter.spec.install_argv
    return argv[0][0] if argv else None


def installer_present(installer: str | None) -> bool:
    return installer is not None and shutil.which(installer) is not None


def install_state(tool_id: str) -> InstallState | None:
    """The current install state, with stale running entries degraded to failed."""
    with _lock:
        state = _states.get(tool_id)
        if (
            state is not None
            and state.status == "running"
            and datetime.now(UTC) - state.started_at > _STALE_AFTER
        ):
            state = InstallState(
                status="failed",
                error="The install timed out or the server restarted mid-install.",
                started_at=state.started_at,
            )
            _states[tool_id] = state
        return state


def start_install(tool_id: str) -> None:
    """Kick off the curated install in a daemon thread (raises before starting on any
    precondition failure so the API can 404/409 cleanly)."""
    adapter = binary_tool_by_id().get(tool_id)
    if adapter is None:
        raise NotFoundError("Unknown tool")
    if adapter.is_available():
        raise ConflictError("This tool is already installed.")
    if not adapter.spec.install_argv:
        raise ConflictError("This tool has no automated install — use the manual command.")
    installer = installer_for(adapter)
    if not installer_present(installer):
        raise ConflictError(
            f"The automated install needs '{installer}', which is not on the server's PATH — "
            "use the manual command."
        )
    with _lock:
        state = _states.get(tool_id)
        if (
            state is not None
            and state.status == "running"
            and datetime.now(UTC) - state.started_at <= _STALE_AFTER
        ):
            raise ConflictError("An install for this tool is already running.")
        _states[tool_id] = InstallState(status="running", error=None, started_at=datetime.now(UTC))
    threading.Thread(
        target=_run_install, args=(tool_id, adapter), name=f"tool-install-{tool_id}", daemon=True
    ).start()


def _run_install(tool_id: str, adapter: ExternalTool) -> None:
    try:
        for argv in adapter.spec.install_argv:
            proc = subprocess.run(
                list(argv),
                capture_output=True,
                text=True,
                timeout=_COMMAND_TIMEOUT_SECONDS,
                shell=False,
            )
            if proc.returncode != 0:
                detail = (proc.stderr or proc.stdout or "").strip()[-_ERROR_TAIL_CHARS:]
                _settle(tool_id, "failed", f"`{' '.join(argv)}` exited {proc.returncode}: {detail}")
                return
        status = adapter.status()
        if not status.available:
            _settle(
                tool_id,
                "failed",
                "The install command succeeded but the binary is still not detectable — "
                "check your PATH, or install manually.",
            )
            return
        _persist_availability(tool_id, status.available, status.version)
        _settle(tool_id, "succeeded", None)
        logger.info("Installed tool %s (%s)", tool_id, status.version or "unknown version")
    except subprocess.TimeoutExpired:
        _settle(tool_id, "failed", "The install command timed out after 10 minutes.")
    except Exception as exc:
        logger.exception("Tool install crashed for %s", tool_id)
        _settle(tool_id, "failed", str(exc)[:_ERROR_TAIL_CHARS])


def _settle(tool_id: str, status: InstallStatus, error: str | None) -> None:
    with _lock:
        started = _states.get(tool_id)
        _states[tool_id] = InstallState(
            status=status,
            error=error,
            started_at=started.started_at if started else datetime.now(UTC),
        )


def _persist_availability(tool_id: str, available: bool, version: str | None) -> None:
    """Flip the persisted catalog row so `GET /tools` reflects the install without a full sync."""
    from shire.core.db import unit_of_work
    from shire.domain.tools.models import ToolRow

    with unit_of_work() as session:
        row = session.get(ToolRow, tool_id)
        if row is not None:
            row.available = available
            row.version = version
            row.synced_at = datetime.now(UTC)
