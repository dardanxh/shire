import type { TFunction } from "i18next";
import { z } from "zod";

import type { components } from "@/lib/api-types.gen";

export type ArchetypeFamily =
  components["schemas"]["ArchetypeResult"]["family"];

/** The 10 archetype families — mirrors the backend enum (checked by `satisfies`). */
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
] as const satisfies readonly ArchetypeFamily[];

/**
 * One accent color per family — data-visualization palette (like the diagram
 * role colors), used e.g. for the category stripe on architecture cards.
 */
export const FAMILY_COLORS: Record<ArchetypeFamily, string> = {
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

export const SEED_TIERS = [1, 2, 3] as const;

/**
 * Form schema (factory so validation messages go through i18n).
 * `typical_category_slugs` / `default_blueprint_slugs` are seed-managed and
 * intentionally not part of the form (shown read-only on the edit page).
 * No `.default()` — RHF's `defaultValues` owns defaults.
 */
export function buildArchetypeFormSchema(t: TFunction) {
  return z.object({
    name: z.string().min(1, t("archetypes.form.name_required")),
    slug: z.string().min(1, t("archetypes.form.slug_required")),
    family: z.enum(FAMILIES, { error: t("archetypes.form.family_required") }),
    summary: z.string(),
    description: z.string(),
    supports_greenfield: z.boolean(),
    supports_brownfield: z.boolean(),
    is_initiative: z.boolean(),
    seed_tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  });
}

export type ArchetypeFormValues = z.infer<
  ReturnType<typeof buildArchetypeFormSchema>
>;
