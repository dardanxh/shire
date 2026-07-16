/**
 * Roadmap detail tabs. Dependency-free so route `validateSearch` can import it
 * without pulling the heavy view into the main bundle.
 */
export const ROADMAP_TAB_VALUES = [
  "board",
  "graph",
  "timeline",
  "items",
  "insights",
] as const;

export type RoadmapTab = (typeof ROADMAP_TAB_VALUES)[number];
