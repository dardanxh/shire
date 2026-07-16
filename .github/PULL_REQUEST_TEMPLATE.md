## What & why

<!-- What does this PR change, and why? Link related issues. -->

## Checks

- [ ] Backend: `uv run ruff check` + `uv run pytest` pass (if `be/` or `engine/` changed)
- [ ] Frontend: `pnpm typecheck` + `pnpm lint` pass (if `ui/` changed)
- [ ] Regenerated `ui/src/lib/api-types.gen.ts` (if API paths/schemas changed)
- [ ] Added an Alembic migration (if DB models changed)
