"""Reusable pagination: a `PaginationParams` dependency + a `Page[T]` envelope.

Every list endpoint takes `params: PaginationParams = Depends()` and returns `Page[SomeResult]`
with `{items, total, page, page_size, total_pages}` (per the FastAPI best-practices skill).
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Query
from pydantic import BaseModel

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


@dataclass(frozen=True)
class PaginationParams:
    """Query-param dependency: `?page=1&page_size=20`."""

    page: int = 1
    page_size: int = DEFAULT_PAGE_SIZE

    def __init__(
        self,
        page: int = Query(1, ge=1, description="1-based page number"),
        page_size: int = Query(
            DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE, description="Items per page"
        ),
    ) -> None:
        object.__setattr__(self, "page", page)
        object.__setattr__(self, "page_size", page_size)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        return self.page_size


class Page[T](BaseModel):
    """Paginated list envelope."""

    items: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int

    @classmethod
    def create(cls, items: list[T], total: int, params: PaginationParams) -> Page[T]:
        total_pages = (total + params.page_size - 1) // params.page_size if params.page_size else 0
        return cls(
            items=items,
            total=total,
            page=params.page,
            page_size=params.page_size,
            total_pages=total_pages,
        )
