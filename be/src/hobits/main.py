"""FastAPI application assembly.

Wires the domain routers under the `/api/v1` prefix and registers the global exception handlers
that render every error as `{detail, code}`.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from hobits.core.exceptions import register_exception_handlers
from hobits.core.settings import get_settings
from hobits.domain.briefing.routes import router as briefing_router
from hobits.domain.connections.routes import router as connections_router
from hobits.domain.context.routes import router as context_router
from hobits.domain.hobits.routes import router as hobits_router
from hobits.domain.members.routes import router as members_router
from hobits.domain.merge_review.routes import router as merge_reviews_router
from hobits.domain.repository.routes import router as repositories_router
from hobits.domain.substrate.routes import router as substrate_router
from hobits.domain.substrate.services import (
    ARTIFACTS_PATH,
    CC_VIEWER_PATH,
    GRAPH_ARTIFACTS_PATH,
)
from hobits.domain.tools.routes import router as tools_router
from hobits.integrations.external_tools.codecharta import resolve_viewer_dir

API_V1_PREFIX = "/api/v1"

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """On startup, converge Prefect deployments to the stored cadences (no-op unless the scheduler
    is enabled). Best-effort: a Prefect outage must never block the API from serving."""
    settings = get_settings()
    if settings.scheduler_enabled:
        from hobits.core.db import unit_of_work
        from hobits.orchestration.schedule_sync import PrefectScheduleSync

        try:
            with unit_of_work() as session:
                PrefectScheduleSync(session).sync_all()
        except Exception:
            logger.warning("Startup schedule reconcile failed.", exc_info=True)
    yield


app = FastAPI(title="Hobits — Substrate API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    # Dev origins (Next :3000, Vite :5173/:5174). In dev the SPA talks through the
    # Vite proxy so CORS isn't hit; these cover direct calls.
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(repositories_router, prefix=API_V1_PREFIX)
app.include_router(substrate_router, prefix=API_V1_PREFIX)
app.include_router(connections_router, prefix=API_V1_PREFIX)
app.include_router(tools_router, prefix=API_V1_PREFIX)
app.include_router(members_router, prefix=API_V1_PREFIX)
app.include_router(context_router, prefix=API_V1_PREFIX)
app.include_router(hobits_router, prefix=API_V1_PREFIX)
app.include_router(briefing_router, prefix=API_V1_PREFIX)
app.include_router(merge_reviews_router, prefix=API_V1_PREFIX)

# Serve generated codebase-graph artifacts (emerge HTML apps) read-only. Mounted under /api/v1 so
# the dev Vite proxy (/api → :8000) reaches it same-origin and the UI can iframe the graph. The
# directory must exist before mounting, so materialize it here.
_settings = get_settings()
_settings.ensure_dirs()
app.mount(
    GRAPH_ARTIFACTS_PATH,
    StaticFiles(directory=_settings.graph_root),
    name="graph-artifacts",
)
# Other visualization artifacts (git-of-theseus SVG, code-maat JSON, CodeCharta maps).
app.mount(
    ARTIFACTS_PATH,
    StaticFiles(directory=_settings.artifacts_root),
    name="artifacts",
)
# CodeCharta's static browser viewer (a SPA that loads a map via ?file=). Mounted only when the
# viewer package is installed; the code-map endpoint reports viewer_available accordingly.
_cc_viewer = resolve_viewer_dir()
if _cc_viewer is not None:
    app.mount(CC_VIEWER_PATH, StaticFiles(directory=_cc_viewer, html=True), name="cc-viewer")


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}
