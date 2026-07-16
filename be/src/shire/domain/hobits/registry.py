"""The code registry of hobit definitions (mirrors the external-tools registry).

Hobit *behavior* lives in code (the generic RepoHobit engine); a hobit is defined by its `HobitSpec`
in `roster.py`. Only *config* (charter, instructions, model, ...) is data.
"""

from __future__ import annotations

from shire.domain.hobits.domain import Hobit, HobitSpec
from shire.domain.hobits.roster import HOBITS

_BY_SLUG: dict[str, Hobit] = {h.spec.slug: h for h in HOBITS}


def all_specs() -> list[HobitSpec]:
    return [h.spec for h in HOBITS]


def get_hobit(slug: str) -> Hobit | None:
    return _BY_SLUG.get(slug)
