/** Enum constants, colors, and rating maps for the architecture-qualities catalog. */

export const QUALITY_CATEGORIES = [
  "performance",
  "reliability",
  "recovery",
  "data-integrity",
  "operability",
] as const;
export type QualityCategory = (typeof QUALITY_CATEGORIES)[number];

export const QUALITY_RATINGS = [
  "strong",
  "moderate",
  "limited",
  "trade-off",
] as const;
export type QualityRating = (typeof QUALITY_RATINGS)[number];

export const QUALITY_TABS = ["catalog", "matrix"] as const;
export type QualityTab = (typeof QUALITY_TABS)[number];

/** Card stripe colors per category, washed to 50% alpha at the call site (`${color}80`). */
export const QUALITY_CATEGORY_COLORS: Record<QualityCategory, string> = {
  performance: "#0ea5e9", // sky
  reliability: "#10b981", // emerald
  recovery: "#6366f1", // indigo
  "data-integrity": "#d946ef", // fuchsia
  operability: "#f59e0b", // amber
};

export const RATING_BADGE_VARIANT = {
  strong: "success",
  moderate: "accent",
  limited: "warning",
  "trade-off": "destructive",
} as const;

/** Heatmap cell fill per rating (matches the semantic badge tokens). */
export const RATING_CELL_COLOR: Record<QualityRating, string> = {
  strong: "#10b981", // emerald
  moderate: "#0ea5e9", // sky
  limited: "#f59e0b", // amber
  "trade-off": "#f43f5e", // rose
};

/** Sort index so strong manifestations lead and trade-offs trail. */
export const RATING_ORDER: Record<QualityRating, number> = {
  strong: 0,
  moderate: 1,
  limited: 2,
  "trade-off": 3,
};
