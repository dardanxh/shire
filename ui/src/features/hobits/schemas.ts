import type { TFunction } from "i18next";
import { z } from "zod";

/**
 * Hobit config form. Mirrors the backend `HobitConfigUpdate`. `timeout_seconds` is kept as a
 * string in the form (number inputs emit strings) and converted to a number in the submit handler
 * — no `z.coerce`, which would mismatch the resolver's input/output types.
 */
export function makeHobitConfigSchema(t: TFunction) {
  return z.object({
    enabled: z.boolean(),
    model: z.string().trim().min(1, t("hobits.form.model.required")),
    charter: z.string().trim().min(1, t("hobits.form.charter.required")),
    instructions: z
      .string()
      .trim()
      .min(1, t("hobits.form.instructions.required")),
    timeout_seconds: z
      .string()
      .refine((v) => Number(v) > 0, t("hobits.form.timeout.invalid")),
    tags: z.string(), // comma-separated; split in the submit handler
  });
}

export type HobitConfigFormValues = z.infer<
  ReturnType<typeof makeHobitConfigSchema>
>;

export const HOBIT_MODELS = ["sonnet", "opus", "haiku"] as const;

/**
 * Full custom-hobit form (create + edit). Superset of the config form with identity fields
 * (name, description, category). Same conventions: `timeout_seconds` as a string, `tags`
 * comma-separated — both converted in the submit handler.
 */
export function makeHobitSchema(t: TFunction) {
  return z.object({
    name: z.string().trim().min(1, t("hobits.form.name.required")),
    description: z
      .string()
      .trim()
      .min(1, t("hobits.form.description.required")),
    category: z.string().trim().min(1, t("hobits.form.category.required")),
    model: z.string().trim().min(1, t("hobits.form.model.required")),
    charter: z.string().trim().min(1, t("hobits.form.charter.required")),
    instructions: z
      .string()
      .trim()
      .min(1, t("hobits.form.instructions.required")),
    timeout_seconds: z
      .string()
      .refine((v) => Number(v) > 0, t("hobits.form.timeout.invalid")),
    tags: z.string(),
    enabled: z.boolean(),
  });
}

export type HobitFormValues = z.infer<ReturnType<typeof makeHobitSchema>>;
