"""Derive A-E ratings from enrichment metrics (deterministic mapping)."""

from __future__ import annotations

from hobits.substrate.domain.enrichment import Enrichment, Rating, Ratings


def compute_ratings(e: Enrichment, *, security_ran: bool, health_ran: bool) -> Ratings:
    return Ratings(
        maintainability=_maintainability(e),
        security=_security(e) if security_ran else Rating.na,
        health=_health(e) if health_ran else Rating.na,
    )


def _maintainability(e: Enrichment) -> Rating:
    # Prefer radon's Maintainability Index (0-100, higher = better); else fall back to complexity.
    if e.maintainability_index is not None:
        mi = e.maintainability_index
        if mi >= 85:
            return Rating.a
        if mi >= 70:
            return Rating.b
        if mi >= 55:
            return Rating.c
        if mi >= 40:
            return Rating.d
        return Rating.e
    if e.ccn_average is not None:
        ccn = e.ccn_average
        if ccn <= 5:
            return Rating.a
        if ccn <= 10:
            return Rating.b
        if ccn <= 20:
            return Rating.c
        if ccn <= 40:
            return Rating.d
        return Rating.e
    return Rating.na


def _security(e: Enrichment) -> Rating:
    if e.secret_count > 0 or e.vuln_critical > 0:
        return Rating.e
    if e.vuln_high > 0:
        return Rating.d
    if e.vuln_moderate > 0:
        return Rating.c
    if e.vuln_low > 0:
        return Rating.b
    return Rating.a


def _health(e: Enrichment) -> Rating:
    if e.health_score is None or e.health_score < 0:
        return Rating.na
    score = e.health_score
    if score >= 8:
        return Rating.a
    if score >= 6:
        return Rating.b
    if score >= 4:
        return Rating.c
    if score >= 2:
        return Rating.d
    return Rating.e
