import type { TFunction } from "i18next";
import { z } from "zod";

/**
 * Hobit config form. Mirrors the backend `HobitConfigUpdate`. `timeout_seconds` is kept as a
 * string in the form (number inputs emit strings) and converted to a number in the submit handler
 * — no `z.coerce`, which would mismatch the resolver's input/output types.
 */
export function makeHobitConfigSchema(t: TFunction) {
  return z.object({
    name: z.string().trim().min(1, t("hobits.form.name.required")),
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
    // Tags are edited inline on the view page, not in this form.
  });
}

export type HobitConfigFormValues = z.infer<
  ReturnType<typeof makeHobitConfigSchema>
>;

/**
 * The models a hobit can run on — the Claude Code CLI's model aliases (`--model <alias>`).
 * Name/version are product names (not translated); descriptions live under `hobits.models.*`.
 */
export const HOBIT_MODELS = [
  { alias: "opus", name: "Opus", version: "Opus 4.8" },
  { alias: "fable", name: "Fable", version: "Fable 5" },
  { alias: "sonnet", name: "Sonnet", version: "Sonnet 4.6" },
  { alias: "haiku", name: "Haiku", version: "Haiku 4.5" },
] as const;

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
