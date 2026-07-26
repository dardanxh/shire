"""FastAPI application assembly.

Wires the domain routers under the `/api/v1` prefix and registers the global exception handlers
that render every error as `{detail, code}`.
"""

from __future__ import annotations

import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi_pagination import add_pagination

from shire.core.exceptions import register_exception_handlers
from shire.core.settings import get_settings
from shire.domain.blueprint.routes import router as blueprints_router
from shire.domain.briefing.routes import router as briefing_router
from shire.domain.capacity.routes import router as capacity_router
from shire.domain.compliance.routes import router as compliance_router
from shire.domain.connections.routes import router as connections_router
from shire.domain.context.routes import router as context_router
from shire.domain.council.routes import router as council_router
from shire.domain.hobits.routes import router as hobits_router
from shire.domain.home.routes import router as home_router
from shire.domain.jobs.routes import router as jobs_router
from shire.domain.members.routes import router as members_router
from shire.domain.merge_review.routes import router as merge_reviews_router
from shire.domain.modelling.routes import router as modelling_router
from shire.domain.news.routes import router as news_router
from shire.domain.principles.routes import router as principles_router
from shire.domain.qualities.routes import router as qualities_router
from shire.domain.readiness.routes import router as readiness_router
from shire.domain.repository.routes import router as repositories_router
from shire.domain.roadmap.routes import repo_router as repo_roadmaps_router
from shire.domain.roadmap.routes import router as roadmaps_router
from shire.domain.security.routes import practices_router as practices_router
from shire.domain.security.routes import regulations_router as regulations_router
from shire.domain.substrate.routes import router as substrate_router
from shire.domain.substrate.services import (
    ARTIFACTS_PATH,
    CC_VIEWER_PATH,
    GRAPH_ARTIFACTS_PATH,
)
from shire.domain.technology.routes import categories_router as tech_categories_router
from shire.domain.technology.routes import technologies_router as technologies_router
from shire.domain.tools.routes import router as tools_router
from shire.integrations.external_tools.codecharta import resolve_viewer_dir

API_V1_PREFIX = "/api/v1"

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """On startup: start the job-completion dispatcher (applies engine job results to their
    domains) and converge Prefect deployments to the stored cadences (no-op unless the scheduler
    is enabled). Best-effort: a Prefect outage must never block the API from serving."""
    from shire.domain.jobs import dispatcher

    stop_dispatcher = threading.Event()
    dispatcher.start(stop_dispatcher)

    settings = get_settings()
    if settings.scheduler_enabled:
        from shire.core.db import unit_of_work
        from shire.orchestration.schedule_sync import PrefectScheduleSync

        try:
            with unit_of_work() as session:
                PrefectScheduleSync(session).sync_all()
        except Exception:
            logger.warning("Startup schedule reconcile failed.", exc_info=True)
    yield
    stop_dispatcher.set()


app = FastAPI(title="Shire — Substrate API", version="0.1.0", lifespan=lifespan)

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
app.include_router(jobs_router, prefix=API_V1_PREFIX)
app.include_router(principles_router, prefix=API_V1_PREFIX)
app.include_router(news_router, prefix=API_V1_PREFIX)
app.include_router(roadmaps_router, prefix=API_V1_PREFIX)
app.include_router(repo_roadmaps_router, prefix=API_V1_PREFIX)
app.include_router(council_router, prefix=API_V1_PREFIX)
app.include_router(home_router, prefix=API_V1_PREFIX)
app.include_router(blueprints_router, prefix=API_V1_PREFIX)
app.include_router(tech_categories_router, prefix=API_V1_PREFIX)
app.include_router(technologies_router, prefix=API_V1_PREFIX)
app.include_router(modelling_router, prefix=API_V1_PREFIX)
app.include_router(regulations_router, prefix=API_V1_PREFIX)
app.include_router(practices_router, prefix=API_V1_PREFIX)
app.include_router(qualities_router, prefix=API_V1_PREFIX)
app.include_router(compliance_router, prefix=API_V1_PREFIX)
app.include_router(capacity_router, prefix=API_V1_PREFIX)
app.include_router(readiness_router, prefix=API_V1_PREFIX)

# fastapi-pagination wires its Params/Page plumbing for the catalog routers above.
add_pagination(app)

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
