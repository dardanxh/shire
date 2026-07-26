import type { TFunction } from "i18next";
import { z } from "zod";

import type { components } from "@/lib/api-types.gen";

export type ModellingFamily =
  components["schemas"]["ModellingStrategyResult"]["family"];
export type ModellingComplexity =
  components["schemas"]["ModellingStrategyResult"]["complexity"];
export type ModellingTopic =
  components["schemas"]["ModellingStrategyResult"]["topic"];
export type ModellingExample = components["schemas"]["ModellingExample"];

/**
 * Mirrors the backend TOPIC_BY_FAMILY map. `Record<ModellingFamily, ...>` forces
 * exhaustiveness — after `pnpm openapi:gen` adds a family, typecheck fails here
 * until it is mapped (unlike a `satisfies` list, which only validates members).
 */
export const TOPIC_BY_FAMILY = {
  normalization: "modelling",
  "warehouse-methodologies": "modelling",
  "dimensional-schemas": "modelling",
  nosql: "modelling",
  specialized: "modelling",
  "slowly-changing-dimensions": "evolution",
  compatibility: "evolution",
  "migration-patterns": "evolution",
  "text-formats": "serialization",
  "binary-row-formats": "serialization",
  "columnar-formats": "serialization",
} as const satisfies Record<ModellingFamily, ModellingTopic>;

export const TOPICS = [
  "modelling",
  "evolution",
  "serialization",
] as const satisfies readonly ModellingTopic[];

export const FAMILIES = Object.keys(TOPIC_BY_FAMILY) as ModellingFamily[];

/** Declared order doubles as the section order on the browse grid. */
export const FAMILIES_BY_TOPIC: Record<ModellingTopic, ModellingFamily[]> = {
  modelling: [
    "normalization",
    "warehouse-methodologies",
    "dimensional-schemas",
    "nosql",
    "specialized",
  ],
  evolution: [
    "slowly-changing-dimensions",
    "compatibility",
    "migration-patterns",
  ],
  serialization: ["text-formats", "binary-row-formats", "columnar-formats"],
};

export const COMPLEXITIES = [
  "low",
  "medium",
  "high",
] as const satisfies readonly ModellingComplexity[];

export const COMPLEXITY_BADGE_VARIANT = {
  low: "success",
  medium: "warning",
  high: "destructive",
} as const;

/**
 * Form schema (factory so validation messages go through i18n).
 * Divergences from the API shape, normalized in ModellingStrategyForm helpers:
 * pros/cons/example_decisions are one-per-line textarea strings (API: string[]);
 * origin_year is a 4-digit string or "" (API: number | null); example_* fields
 * flatten the ModellingExample object (tables as pipe-syntax blocks).
 * No `.default()` — RHF owns defaults.
 */
export function buildModellingStrategyFormSchema(t: TFunction) {
  return z.object({
    name: z.string().min(1, t("modelling.form.name_required")),
    slug: z.string().min(1, t("modelling.form.slug_required")),
    topic: z.enum(TOPICS),
    family: z.enum(FAMILIES as [ModellingFamily, ...ModellingFamily[]], {
      error: t("modelling.form.family_required"),
    }),
    description: z.string(),
    best_for: z.string().max(300, t("modelling.form.best_for_too_long")),
    pros: z.string(),
    cons: z.string(),
    complexity: z.enum(COMPLEXITIES),
    origin_year: z
      .string()
      .regex(/^\d{4}$/, t("modelling.form.year_invalid"))
      .or(z.literal("")),
    originator: z.string(),
    example_narrative: z.string(),
    example_tables: z.string(),
    example_snippets: z.string(),
    example_decisions: z.string(),
    diagram: z.string(),
    related_technology_slugs: z.array(z.string()),
  });
}

export type ModellingStrategyFormValues = z.infer<
  ReturnType<typeof buildModellingStrategyFormSchema>
>;
