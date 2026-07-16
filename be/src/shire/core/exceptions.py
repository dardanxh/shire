"""Application error hierarchy + global FastAPI exception handlers.

All handled errors serialize to a consistent body: ``{"detail": ..., "code": ...}``. Domain and
service code raises `AppError` subclasses; routes stay free of HTTP status plumbing. Internal
errors (DB, tracebacks) are never exposed — they collapse to a generic 500.
"""

from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Base for expected, client-facing errors. Subclasses set `status_code` + `code`."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "BAD_REQUEST"

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "NOT_FOUND"


class ConflictError(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "CONFLICT"


class ValidationError(AppError):
    status_code = 422  # Unprocessable Content
    code = "VALIDATION_ERROR"


def register_exception_handlers(app: FastAPI) -> None:
    """Wire global handlers so every error returns the `{detail, code}` shape."""

    @app.exception_handler(AppError)
    async def _handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "code": exc.code},
        )

    @app.exception_handler(Exception)
    async def _handle_unexpected(_request: Request, _exc: Exception) -> JSONResponse:
        # Never leak internal errors (DB errors, tracebacks) to the client.
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal server error.", "code": "INTERNAL_ERROR"},
        )
