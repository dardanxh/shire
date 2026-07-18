import type { TFunction } from "i18next";
import { z } from "zod";

/** New/edit council topic form. Repos + DA toggle ride along as plain fields. */
export function makeCouncilTopicSchema(t: TFunction) {
  return z.object({
    name: z.string().trim().min(1, t("council.new.name_required")).max(200),
    description: z
      .string()
      .trim()
      .min(1, t("council.new.description_required"))
      .max(10_000),
    repository_ids: z.array(z.string()),
    devils_advocate: z.boolean(),
  });
}

export type CouncilTopicFormValues = z.infer<
  ReturnType<typeof makeCouncilTopicSchema>
>;
