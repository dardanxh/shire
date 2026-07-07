"""FastAPI application assembly.

Wires the domain routers under the `/api/v1` prefix and registers the global exception handlers
that render every error as `{detail, code}`.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from hobits.core.exceptions import register_exception_handlers
from hobits.domain.repository.routes import router as repositories_router
from hobits.domain.substrate.routes import router as substrate_router

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


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}
