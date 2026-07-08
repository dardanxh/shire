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
  });
}

export type HobitConfigFormValues = z.infer<
  ReturnType<typeof makeHobitConfigSchema>
>;
