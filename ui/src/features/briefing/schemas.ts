import type { TFunction } from "i18next";
import { z } from "zod";

/**
 * Run-feedback form. Mirrors the backend `UpsertHobitRunFeedback`. `rating` defaults to 0 in the
 * form ("no stars picked yet"); min(1) turns that into a validation message on submit.
 */
export function makeRunFeedbackSchema(t: TFunction) {
  return z.object({
    rating: z
      .number()
      .int()
      .min(1, t("briefing.feedback.rating_required"))
      .max(5),
    comment: z.string().max(2000),
  });
}

export type RunFeedbackFormValues = z.infer<
  ReturnType<typeof makeRunFeedbackSchema>
>;
