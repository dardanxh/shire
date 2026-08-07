/**
 * Prompt-workbench tab identifiers. Kept in a standalone, dependency-free module so the route can
 * import them at module load (for `validateSearch`) without eagerly pulling in the heavy workbench
 * component — which would defeat the router's per-route code-splitting.
 *
 * Order is the working order: write it, read what is wrong with it, test it against real models,
 * then compare versions over time.
 *
 * Tuning and the proposed rewrite have no tabs of their own — both are collapsible sections inside
 * the editor, because asking for a rewrite and reviewing one are part of writing, not separate
 * destinations. Stale `?tab=tuning` / `?tab=suggestions` links still work: the route's
 * `validateSearch` falls back to the editor.
 */
export const PROMPT_TAB_VALUES = [
  "editor",
  "checks",
  "arena",
  "versions",
  "dashboard",
] as const;

export type PromptTab = (typeof PROMPT_TAB_VALUES)[number];
