/**
 * Prompt-workbench tab identifiers. Kept in a standalone, dependency-free module so the route can
 * import them at module load (for `validateSearch`) without eagerly pulling in the heavy workbench
 * component — which would defeat the router's per-route code-splitting.
 *
 * Order is the working order: write it, read what is wrong with it, tune it, take the model's
 * rewrite, test it against real models, then compare versions over time.
 */
export const PROMPT_TAB_VALUES = [
  "editor",
  "checks",
  "tuning",
  "suggestions",
  "arena",
  "versions",
  "dashboard",
] as const;

export type PromptTab = (typeof PROMPT_TAB_VALUES)[number];
