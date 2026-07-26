"""Seed CLI — loads curated seed data (JSON under `seeds/data/`) idempotently.

Each seeder upserts by slug and never deletes; rows whose `source` is `user` are left
untouched so in-app edits survive re-seeding. Run via the `shire-seed` console script.
"""
