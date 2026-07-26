import type { TFunction } from "i18next";
import { z } from "zod";

/**
 * Blueprint form schema (factory so validation messages go through i18n).
 * Divergences from the API request shape, normalized in
 * `blueprintFormToPayload`:
 *  - `recommended_technology_id` is `""` for "none" here; the API takes
 *    `string | null`.
 * Stage `position` is intentionally absent — the backend derives it from the
 * array order.
 */
export function buildBlueprintFormSchema(
  t: TFunction,
  { requireSlug = false }: { requireSlug?: boolean } = {},
) {
  return z.object({
    name: z.string().min(1, t("blueprints.form.name_required")),
    // Only the New form shows (and requires) the slug; edits never change it.
    slug: requireSlug
      ? z.string().min(1, t("blueprints.form.slug_required"))
      : z.string(),
    use_case: z.string(),
    description: z.string(),
    // One sentence per line in the form; mapped to string lists for the API.
    when_to_use: z.string(),
    when_not_to_use: z.string(),
    use_cases: z.array(z.string()),
    // One per line as "Title: detail"; mapped to {title, detail} for the API.
    hot_spots: z.string(),
    // One Mermaid source per diagram view; empty ones are dropped from the payload.
    diagram_conceptual: z.string(),
    diagram_logical: z.string(),
    diagram_data_flow: z.string(),
    diagram_sequence: z.string(),
    diagram_stack_aws: z.string(),
    diagram_stack_azure: z.string(),
    diagram_stack_gcp: z.string(),
    diagram_stack_open_source: z.string(),
    diagram_stack_snowflake: z.string(),
    diagram_stack_databricks: z.string(),
    family_tags: z.array(z.string()),
    stages: z.array(
      z.object({
        name: z.string().min(1, t("blueprints.form.stage_name_required")),
        role: z.string(),
        recommended_technology_id: z.string(),
        alternative_technology_ids: z.array(z.string()),
        rationale: z.string(),
      }),
    ),
  });
}

export type BlueprintFormValues = z.infer<
  ReturnType<typeof buildBlueprintFormSchema>
>;

export const EMPTY_STAGE: BlueprintFormValues["stages"][number] = {
  name: "",
  role: "",
  recommended_technology_id: "",
  alternative_technology_ids: [],
  rationale: "",
};

/**
 * Adoption form. `choices` mirrors the blueprint's stages by position
 * (stage_id carried along) so the per-stage pickers are plain indexed fields;
 * empty `technology_id` means "no pick" and is dropped from the payload.
 */
export function buildAdoptionFormSchema(t: TFunction) {
  return z.object({
    project_id: z.string().min(1, t("blueprints.adopt.project_required")),
    choices: z.array(
      z.object({
        stage_id: z.string(),
        technology_id: z.string(),
      }),
    ),
    notes: z.string(),
  });
}

export type AdoptionFormValues = z.infer<
  ReturnType<typeof buildAdoptionFormSchema>
>;
