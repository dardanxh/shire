/**
 * Technology chooser scoring. Pure functions — the single source of truth for ranking
 * candidate technologies within a category against weighted priorities + hard constraints.
 * Scores the corpus's objective attributes only (the corpus has no per-technology
 * architecture-quality ratings).
 */

import type { Technology } from "@/features/technologies";

export type Maturity = "emerging" | "established" | "legacy";
export type CostTier = "free" | "low" | "medium" | "high";
export type DeploymentModel =
  | "cloud"
  | "on_prem"
  | "hybrid"
  | "embedded"
  | "saas";

/** The five weighted axes (0 ignore .. 3 critical). */
export const AXES = [
  "maturity",
  "cost",
  "learning_curve",
  "time_to_win",
  "oss",
] as const;
export type Axis = (typeof AXES)[number];

export type Weights = Record<Axis, number>;

export interface Constraints {
  deployment: DeploymentModel | null;
  oss_only: boolean;
  max_cost_tier: CostTier | null;
  min_maturity: Maturity | null;
}

export const DEFAULT_WEIGHTS: Weights = {
  maturity: 2,
  cost: 2,
  learning_curve: 1,
  time_to_win: 1,
  oss: 0,
};

export const DEFAULT_CONSTRAINTS: Constraints = {
  deployment: null,
  oss_only: false,
  max_cost_tier: null,
  min_maturity: null,
};

// Axis value -> 0..1 "better for this preference" score.
const MATURITY_SCORE: Record<string, number> = {
  emerging: 0.3,
  established: 1,
  legacy: 0.7,
};
const COST_SCORE: Record<string, number> = {
  free: 1,
  low: 0.75,
  medium: 0.4,
  high: 0.1,
};
const LEARNING_SCORE: Record<string, number> = {
  gentle: 1,
  moderate: 0.6,
  steep: 0.2,
};
const TTW_SCORE: Record<string, number> = { hours: 1, days: 0.6, weeks: 0.2 };

// Ordinals for the constraint comparisons.
const COST_ORDER: CostTier[] = ["free", "low", "medium", "high"];
const MATURITY_ORDER: Maturity[] = ["emerging", "established", "legacy"];

export interface ScoredTechnology {
  tech: Technology;
  match: number; // 0..100
  axisScores: Record<Axis, number>; // 0..1 per axis
}

export interface ScoreResult {
  ranked: ScoredTechnology[];
  excludedCount: number;
  candidateCount: number;
}

function axisScore(axis: Axis, tech: Technology): number {
  switch (axis) {
    case "maturity":
      return MATURITY_SCORE[tech.maturity] ?? 0.5;
    case "cost":
      return COST_SCORE[tech.cost_tier] ?? 0.5;
    case "learning_curve":
      return LEARNING_SCORE[tech.learning_curve] ?? 0.5;
    case "time_to_win":
      return TTW_SCORE[tech.time_to_win] ?? 0.5;
    case "oss":
      return tech.oss ? 1 : 0;
  }
}

function passesConstraints(tech: Technology, c: Constraints): boolean {
  if (c.oss_only && !tech.oss) return false;
  if (c.deployment && !tech.deployment_models.includes(c.deployment))
    return false;
  if (c.max_cost_tier) {
    const cap = COST_ORDER.indexOf(c.max_cost_tier);
    if (COST_ORDER.indexOf(tech.cost_tier as CostTier) > cap) return false;
  }
  if (c.min_maturity) {
    const floor = MATURITY_ORDER.indexOf(c.min_maturity);
    if (MATURITY_ORDER.indexOf(tech.maturity as Maturity) < floor) return false;
  }
  return true;
}

/** Filter to a category's candidates (primary or secondary), apply constraints, rank. */
export function scoreCandidates(
  techs: Technology[],
  categoryId: string,
  weights: Weights,
  constraints: Constraints,
): ScoreResult {
  const candidates = techs.filter(
    (tech) =>
      tech.category_id === categoryId ||
      tech.secondary_category_ids.includes(categoryId),
  );
  const allowed = candidates.filter((tech) =>
    passesConstraints(tech, constraints),
  );

  const weightSum = AXES.reduce((sum, axis) => sum + weights[axis], 0);

  const ranked: ScoredTechnology[] = allowed.map((tech) => {
    const axisScores = Object.fromEntries(
      AXES.map((axis) => [axis, axisScore(axis, tech)]),
    ) as Record<Axis, number>;
    // Neutral average when no priorities are set, else the weighted mean.
    const match =
      weightSum === 0
        ? (AXES.reduce((sum, axis) => sum + axisScores[axis], 0) /
            AXES.length) *
          100
        : (AXES.reduce(
            (sum, axis) => sum + weights[axis] * axisScores[axis],
            0,
          ) /
            weightSum) *
          100;
    return { tech, match, axisScores };
  });

  ranked.sort(
    (a, b) => b.match - a.match || a.tech.name.localeCompare(b.tech.name),
  );

  return {
    ranked,
    excludedCount: candidates.length - allowed.length,
    candidateCount: candidates.length,
  };
}
