"""FastAPI application assembly.

Wires the domain routers under the `/api/v1` prefix and registers the global exception handlers
that render every error as `{detail, code}`.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from hobits.core.exceptions import register_exception_handlers
from hobits.core.settings import get_settings
from hobits.domain.connections.routes import router as connections_router
from hobits.domain.repository.routes import router as repositories_router
from hobits.domain.substrate.routes import router as substrate_router
from hobits.domain.substrate.services import (
    ARTIFACTS_PATH,
    CC_VIEWER_PATH,
    GRAPH_ARTIFACTS_PATH,
)
from hobits.integrations.external_tools.codecharta import resolve_viewer_dir

API_V1_PREFIX = "/api/v1"

app = FastAPI(title="Hobits — Substrate API", version="0.1.0")

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
