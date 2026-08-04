/**
 * Repository-detail tab identifiers. Kept in a standalone, dependency-free
 * module so the route can import them at module load (for `validateSearch`)
 * without eagerly pulling in the heavy `RepositoryViewPage` component — which
 * would defeat the router's per-route code-splitting.
 *
 * Order is the display order of the tab strip: a progressive read from the
 * headline scorecard (Overview) into successively deeper detail.
 */
export const REPOSITORY_TAB_VALUES = [
  "overview",
  "actions",
  "ask",
  "code",
  "architecture",
  "tech-stack",
  "ai-readiness",
  "activity",
  "evolution",
  "branches",
  "mrs",
  "cicd",
  "dependencies",
  "security",
  "integrations",
  "context",
  "hobits",
  "principles",
  "roadmaps",
  "jobs",
] as const;

export type RepositoryTab = (typeof REPOSITORY_TAB_VALUES)[number];
