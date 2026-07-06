"""Shared-kernel DDD base types.

Domain objects are Pydantic models so validation lives with the model. Value objects are
frozen (immutable, equality by value); entities carry identity.
"""

from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field


class ValueObject(BaseModel):
    """Immutable, compared by value."""

    model_config = ConfigDict(frozen=True)


class Entity(BaseModel):
    """Has identity; equality is by id."""

    model_config = ConfigDict(validate_assignment=True)

    id: uuid.UUID = Field(default_factory=uuid.uuid4)

    def __eq__(self, other: object) -> bool:
        return isinstance(other, self.__class__) and other.id == self.id

    def __hash__(self) -> int:
        return hash(self.id)


class AggregateRoot(Entity):
    """The only object a repository (persistence port) loads/saves as a unit."""
