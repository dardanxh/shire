import type { TFunction } from "i18next";
import { z } from "zod";

export function makeTopicSchema(t: TFunction) {
  return z.object({
    name: z.string().trim().min(1, t("news.topic_form.name.required")).max(120),
    description: z.string(),
    enabled: z.boolean(),
  });
}

export type TopicFormValues = z.infer<ReturnType<typeof makeTopicSchema>>;

export function makeSourceSchema(t: TFunction) {
  return z.object({
    url: z
      .string()
      .trim()
      .url(t("news.topic_form.sources.invalid_url"))
      .max(2048),
    note: z.string().max(255),
  });
}

export type SourceFormValues = z.infer<ReturnType<typeof makeSourceSchema>>;

/** Preset cadences; "custom" switches to a free cron expression (`cron:<expr>` on the API). */
export const CADENCE_PRESETS = ["manual", "hourly", "daily", "weekly"] as const;

export function makeConfigSchema(t: TFunction) {
  return z
    .object({
      cadence: z.enum([...CADENCE_PRESETS, "custom"]),
      cron: z.string().trim(),
      max_items_per_topic: z.string().refine((v) => {
        const n = Number(v);
        return Number.isInteger(n) && n >= 1 && n <= 50;
      }, t("news.config.max_items.invalid")),
    })
    .refine((v) => v.cadence !== "custom" || v.cron.length > 0, {
      message: t("news.config.cron.required"),
      path: ["cron"],
    });
}

export type ConfigFormValues = z.infer<ReturnType<typeof makeConfigSchema>>;
