import type { TFunction } from "i18next";
import { z } from "zod";

/**
 * Ingest form schema. Built from `t` so validation messages are translated
 * (see the i18n rule — validation copy is user-facing). No `.default()`: RHF
 * holds defaults via `defaultValues`.
 */
export function makeIngestSchema(t: TFunction) {
  return z.object({
    url: z
      .string()
      .trim()
      .min(1, t("repositories.ingest.url.required"))
      .url(t("repositories.ingest.url.invalid")),
  });
}

export type IngestFormValues = z.infer<ReturnType<typeof makeIngestSchema>>;
