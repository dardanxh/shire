"""Briefing bounded context — the tiered digest of hobit findings.

Hobit runs self-score their output; those scores derive a tier (NOW / DAILY / WEEKLY) and a
briefing item is emitted. `GET /briefing` groups items by tier — the "what needs me" surface.
"""
