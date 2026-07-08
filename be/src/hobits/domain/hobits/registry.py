"""The code registry of hobit definitions (mirrors the external-tools registry).

Hobit *behavior* lives in code; only *config* is data. Add a hobit by appending an instance here.
"""

from __future__ import annotations

from hobits.domain.hobits.domain import Hobit, HobitSpec
from hobits.domain.hobits.repo_onboarding import RepoOnboardingHobit

_HOBITS: list[Hobit] = [RepoOnboardingHobit()]
_BY_SLUG: dict[str, Hobit] = {h.spec.slug: h for h in _HOBITS}


def all_specs() -> list[HobitSpec]:
    return [h.spec for h in _HOBITS]


def get_hobit(slug: str) -> Hobit | None:
    return _BY_SLUG.get(slug)
