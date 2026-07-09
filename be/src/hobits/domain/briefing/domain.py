"""Briefing domain: the tier enum + the pure tier-derivation rule.

Scores are integers 0-100. Tiering weights urgency and importance, with confidence as a gate so a
low-confidence finding doesn't scream NOW. Thresholds are module constants so they stay tunable.
"""

from __future__ import annotations

from enum import StrEnum

# Weighted salience: urgency and importance drive the tier; confidence contributes a little and
# gates NOW separately (below).
_W_URGENCY = 0.45
_W_IMPORTANCE = 0.40
_W_CONFIDENCE = 0.15

_NOW_SALIENCE = 70
_NOW_MIN_CONFIDENCE = 50
_HARD_URGENT = 85  # very-urgent findings surface NOW regardless of the rest
_DAILY_SALIENCE = 45


class BriefingTier(StrEnum):
    now = "NOW"
    daily = "DAILY"
    weekly = "WEEKLY"


def salience(importance: int, confidence: int, urgency: int) -> float:
    return _W_URGENCY * urgency + _W_IMPORTANCE * importance + _W_CONFIDENCE * confidence


def derive_tier(importance: int, confidence: int, urgency: int) -> BriefingTier:
    s = salience(importance, confidence, urgency)
    if urgency >= _HARD_URGENT or (s >= _NOW_SALIENCE and confidence >= _NOW_MIN_CONFIDENCE):
        return BriefingTier.now
    if s >= _DAILY_SALIENCE:
        return BriefingTier.daily
    return BriefingTier.weekly
