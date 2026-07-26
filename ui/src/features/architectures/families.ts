/** The 10 blueprint families — the vocabulary behind `family_tags` on architectures. */
export const FAMILIES = [
  "acquisition-ingestion",
  "movement-migration",
  "transformation-modelling",
  "storage-platform",
  "streaming-realtime",
  "orchestration-dataops",
  "governance-security-compliance",
  "analytics-serving",
  "ml-ai-infrastructure",
  "discovery-strategy",
] as const;

export type BlueprintFamily = (typeof FAMILIES)[number];

/**
 * One accent color per family — data-visualization palette (like the diagram
 * role colors), used e.g. for the category stripe on architecture cards.
 */
export const FAMILY_COLORS: Record<BlueprintFamily, string> = {
  "acquisition-ingestion": "#0ea5e9", // sky
  "movement-migration": "#14b8a6", // teal
  "transformation-modelling": "#8b5cf6", // violet
  "storage-platform": "#10b981", // emerald
  "streaming-realtime": "#f97316", // orange
  "orchestration-dataops": "#6366f1", // indigo
  "governance-security-compliance": "#64748b", // slate
  "analytics-serving": "#f59e0b", // amber
  "ml-ai-infrastructure": "#d946ef", // fuchsia
  "discovery-strategy": "#84cc16", // lime
};
