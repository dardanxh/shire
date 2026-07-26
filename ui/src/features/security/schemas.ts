/** Enum constants, badge/stripe colors, and citation helpers for the security catalogs. */

export const REGULATION_CATEGORIES = [
  "privacy",
  "healthcare",
  "payments",
  "financial",
  "ai",
  "resilience",
] as const;
export type RegulationCategory = (typeof REGULATION_CATEGORIES)[number];

export const REGIONS = [
  "eu",
  "us",
  "canada",
  "brazil",
  "india",
  "global",
] as const;
export type RegulationRegion = (typeof REGIONS)[number];

export const PRACTICE_CATEGORIES = [
  "encryption-keys",
  "deidentification",
  "access-control",
  "data-lifecycle",
  "monitoring-response",
] as const;
export type PracticeCategory = (typeof PRACTICE_CATEGORIES)[number];

export const COMPLEXITIES = ["low", "medium", "high"] as const;
export type PracticeComplexity = (typeof COMPLEXITIES)[number];

export const SECURITY_TABS = ["regulations", "practices"] as const;
export type SecurityTab = (typeof SECURITY_TABS)[number];

/** Card stripe colors, washed to 50% alpha at the call site (`${color}80`). */
export const REGULATION_CATEGORY_COLORS: Record<RegulationCategory, string> = {
  privacy: "#0ea5e9", // sky
  healthcare: "#f43f5e", // rose
  payments: "#f59e0b", // amber
  financial: "#10b981", // emerald
  ai: "#d946ef", // fuchsia
  resilience: "#6366f1", // indigo
};

export const PRACTICE_CATEGORY_COLORS: Record<PracticeCategory, string> = {
  "encryption-keys": "#6366f1", // indigo
  deidentification: "#8b5cf6", // violet
  "access-control": "#0ea5e9", // sky
  "data-lifecycle": "#10b981", // emerald
  "monitoring-response": "#f97316", // orange
};

export const COMPLEXITY_BADGE_VARIANT = {
  low: "success",
  medium: "warning",
  high: "destructive",
} as const;

/** Citation prefix per regulation unit_label: "Art. 17", "§ 164.312", "Req. 3", "Principle 4.7". */
export const UNIT_PREFIX = {
  article: "Art.",
  section: "§",
  requirement: "Req.",
  principle: "Principle",
} as const;
export type UnitLabel = keyof typeof UNIT_PREFIX;

/** Stable in-page anchor for an article number: "17" → "art-17", "164.312" → "art-164-312". */
export function artAnchor(number: string): string {
  return `art-${number.replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

/** Display citation for a unit, honoring an explicit per-article override. */
export function unitRef(
  unitLabel: UnitLabel,
  number: string,
  override?: string | null,
): string {
  return override ?? `${UNIT_PREFIX[unitLabel]} ${number}`;
}
