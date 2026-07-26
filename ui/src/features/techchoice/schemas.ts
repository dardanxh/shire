import { z } from "zod";

import {
  AXES,
  type Axis,
  type Constraints,
  type CostTier,
  DEFAULT_CONSTRAINTS,
  DEFAULT_WEIGHTS,
  type DeploymentModel,
  type Maturity,
  type Weights,
} from "./score";

export const MATURITIES = ["emerging", "established", "legacy"] as const;
export const COST_TIERS = ["free", "low", "medium", "high"] as const;
export const DEPLOYMENT_MODELS = [
  "cloud",
  "on_prem",
  "hybrid",
  "embedded",
  "saas",
] as const;

/** Weight scale 0..3 with i18n label keys (`techchoice.weight_level.*`). */
export const WEIGHT_LEVELS = [0, 1, 2, 3] as const;

/** URL search schema: category + five weights + four constraints. */
export const techchoiceSearchSchema = z.object({
  category: z.string().optional().catch(undefined),
  w_maturity: z.coerce
    .number()
    .int()
    .min(0)
    .max(3)
    .catch(DEFAULT_WEIGHTS.maturity),
  w_cost: z.coerce.number().int().min(0).max(3).catch(DEFAULT_WEIGHTS.cost),
  w_learning_curve: z.coerce
    .number()
    .int()
    .min(0)
    .max(3)
    .catch(DEFAULT_WEIGHTS.learning_curve),
  w_time_to_win: z.coerce
    .number()
    .int()
    .min(0)
    .max(3)
    .catch(DEFAULT_WEIGHTS.time_to_win),
  w_oss: z.coerce.number().int().min(0).max(3).catch(DEFAULT_WEIGHTS.oss),
  c_deployment: z.enum(DEPLOYMENT_MODELS).optional().catch(undefined),
  c_oss_only: z.coerce.number().int().min(0).max(1).catch(0),
  c_max_cost_tier: z.enum(COST_TIERS).optional().catch(undefined),
  c_min_maturity: z.enum(MATURITIES).optional().catch(undefined),
});

export type TechchoiceSearch = z.infer<typeof techchoiceSearchSchema>;

export const TECH_CHOOSER_TABS = ["chooser", "history"] as const;
export type TechChooserTab = (typeof TECH_CHOOSER_TABS)[number];

/** Full /tech-chooser search: every chooser input plus the active tab. */
export const techChooserSearchSchema = techchoiceSearchSchema.extend({
  tab: z.enum(TECH_CHOOSER_TABS).catch("chooser"),
});

export type TechChooserSearch = z.infer<typeof techChooserSearchSchema>;

export function searchToWeights(search: TechchoiceSearch): Weights {
  return {
    maturity: search.w_maturity,
    cost: search.w_cost,
    learning_curve: search.w_learning_curve,
    time_to_win: search.w_time_to_win,
    oss: search.w_oss,
  };
}

export function searchToConstraints(search: TechchoiceSearch): Constraints {
  return {
    deployment: (search.c_deployment as DeploymentModel | undefined) ?? null,
    oss_only: search.c_oss_only === 1,
    max_cost_tier: (search.c_max_cost_tier as CostTier | undefined) ?? null,
    min_maturity: (search.c_min_maturity as Maturity | undefined) ?? null,
  };
}

/**
 * Parse a saved decision's `inputs` JSON (or the live search object) back into
 * the chooser config. Unknown keys (e.g. `tab`) are stripped and every field
 * `.catch`es its default, so partially-saved / stale shapes degrade to defaults
 * instead of throwing.
 */
export function parseSavedInputs(
  saved: Record<string, unknown>,
): TechchoiceSearch {
  return techchoiceSearchSchema.parse(saved);
}

export const DEFAULT_SEARCH: TechchoiceSearch = {
  category: undefined,
  w_maturity: DEFAULT_WEIGHTS.maturity,
  w_cost: DEFAULT_WEIGHTS.cost,
  w_learning_curve: DEFAULT_WEIGHTS.learning_curve,
  w_time_to_win: DEFAULT_WEIGHTS.time_to_win,
  w_oss: DEFAULT_WEIGHTS.oss,
  c_deployment: undefined,
  c_oss_only: DEFAULT_CONSTRAINTS.oss_only ? 1 : 0,
  c_max_cost_tier: undefined,
  c_min_maturity: undefined,
};

export { AXES, type Axis, DEFAULT_CONSTRAINTS, DEFAULT_WEIGHTS };
