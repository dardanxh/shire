import { z } from "zod";

/** Add-exclusion form schema. `t` injects localized validation messages. */
export function makeExclusionSchema(t: (key: string) => string) {
  return z.object({
    pattern: z.string().trim().min(1, t("members.exclusions.pattern_required")),
    reason: z.string().trim().optional(),
    is_bot: z.boolean(),
  });
}

export type ExclusionFormValues = z.infer<
  ReturnType<typeof makeExclusionSchema>
>;
