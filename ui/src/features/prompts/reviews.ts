import type { PromptReviewOut } from "@/lib/api";

/**
 * The scored dimensions, in display order, mirroring `prompts/jobs.py:REVIEW_DIMENSIONS`.
 *
 * `inverted` marks the one dimension where a high number is bad. Everything that reads these scores
 * — the bars, the trend chart — has to know which way is good, and one table is better than each
 * consumer remembering.
 */
export const REVIEW_DIMENSIONS = [
  { key: "clarity", inverted: false },
  { key: "specificity", inverted: false },
  { key: "structure", inverted: false },
  { key: "context_sufficiency", inverted: false },
  { key: "factfulness", inverted: false },
  { key: "accuracy", inverted: false },
  { key: "goal_focus", inverted: false },
  { key: "hallucination_risk", inverted: true },
] as const;

export type ReviewDimension = (typeof REVIEW_DIMENSIONS)[number]["key"];

/** Read one score off a review by dimension key. */
export function scoreFor(
  review: PromptReviewOut,
  dimension: ReviewDimension,
): number | null {
  return review[dimension] ?? null;
}

/**
 * A single "how good is this prompt, per the model" number: the mean of the scores, with the
 * inverted dimension flipped so higher is always better.
 *
 * Used for the trend line, where eight overlapping series would be unreadable. Returns null when
 * nothing was scored rather than a misleading zero.
 */
export function overallReviewScore(review: PromptReviewOut): number | null {
  const values = REVIEW_DIMENSIONS.map(({ key, inverted }) => {
    const value = scoreFor(review, key);
    if (value === null) return null;
    return inverted ? 100 - value : value;
  }).filter((value): value is number => value !== null);

  if (values.length === 0) return null;
  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}
