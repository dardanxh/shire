/** Standardized use-case tag slugs; labels live at `blueprints.use_case_tags.*`. */
export const USE_CASE_SLUGS = [
  "reporting",
  "realtime",
  "ml",
  "embedded",
  "activation",
  "compliance",
  "integration",
  "self_serve",
  "ai",
  "operational",
] as const;

export type UseCaseSlug = (typeof USE_CASE_SLUGS)[number];
