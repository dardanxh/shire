import type { TFunction } from "i18next";
import { z } from "zod";

export const MATURITIES = ["emerging", "established", "legacy"] as const;
export const DEPLOYMENT_MODELS = [
  "cloud",
  "on_prem",
  "hybrid",
  "embedded",
  "saas",
] as const;

/** One credential input of an auth method; secret values are write-only server-side. */
export function buildAuthMethodFieldSchema(t: TFunction) {
  return z.object({
    key: z.string().min(1, t("technologies.auth_methods.field_key_required")),
    label: z
      .string()
      .min(1, t("technologies.auth_methods.field_label_required")),
    secret: z.boolean(),
    required: z.boolean(),
  });
}

export function buildAuthMethodSchema(t: TFunction) {
  return z.object({
    slug: z.string().min(1, t("technologies.auth_methods.slug_required")),
    name: z.string().min(1, t("technologies.auth_methods.name_required")),
    fields: z.array(buildAuthMethodFieldSchema(t)),
  });
}

/**
 * Form schema (factory so validation messages go through i18n). Divergences
 * from the API request shape, normalized in the page submit handlers:
 *  - `aliases` / `tags` are comma-separated string inputs here; the API takes
 *    `string[]`.
 *  - `homepage_url` allows `""` here; the API takes `string | null`.
 * No `.default()` — RHF's `defaultValues` owns defaults.
 */
export function buildTechnologyFormSchema(t: TFunction) {
  return z.object({
    name: z.string().min(1, t("technologies.form.name_required")),
    slug: z.string().min(1, t("technologies.form.slug_required")),
    category_id: z.string().min(1, t("technologies.form.category_required")),
    description: z.string(),
    homepage_url: z.union([
      z.literal(""),
      z.url(t("technologies.form.homepage_url_invalid")),
    ]),
    maturity: z.enum(MATURITIES),
    oss: z.boolean(),
    deployment_models: z.array(z.enum(DEPLOYMENT_MODELS)),
    aliases: z.string(),
    tags: z.string(),
    auth_methods: z.array(buildAuthMethodSchema(t)),
  });
}

export type TechnologyFormValues = z.infer<
  ReturnType<typeof buildTechnologyFormSchema>
>;

/** Inline category add. `parent_id: ""` means top-level group (null for the API). */
export function buildCategoryFormSchema(t: TFunction) {
  return z.object({
    name: z.string().min(1, t("technologies.categories.name_required")),
    slug: z.string().min(1, t("technologies.categories.slug_required")),
    parent_id: z.string(),
  });
}

export type CategoryFormValues = z.infer<
  ReturnType<typeof buildCategoryFormSchema>
>;

/** Inline rename — name only. */
export function buildCategoryRenameSchema(t: TFunction) {
  return z.object({
    name: z.string().min(1, t("technologies.categories.name_required")),
  });
}

export type CategoryRenameValues = z.infer<
  ReturnType<typeof buildCategoryRenameSchema>
>;
