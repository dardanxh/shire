import type { TFunction } from "i18next";
import { z } from "zod";

import { NOTIFY_ON } from "./api";

/** Bookmark create/edit. `categoryId` "" means uncategorized (the API wants null). */
export function makeBookmarkSchema(t: TFunction) {
  return z.object({
    name: z.string().trim().min(1, t("launchpad.form.name.required")),
    url: z
      .string()
      .trim()
      .min(1, t("launchpad.form.url.required"))
      .refine(
        (value) => {
          try {
            const parsed = new URL(
              value.includes("://") ? value : `https://${value}`,
            );
            return parsed.protocol === "http:" || parsed.protocol === "https:";
          } catch {
            return false;
          }
        },
        { message: t("launchpad.form.url.invalid") },
      ),
    description: z.string().optional(),
    categoryId: z.string(),
    logoKind: z.enum(["favicon", "monogram"]),
  });
}

export type BookmarkFormValues = z.infer<ReturnType<typeof makeBookmarkSchema>>;

/** Fixed cadence choices; anything else is entered as a custom cadence string. */
export const CADENCE_PRESETS = [
  "manual",
  "every:5m",
  "every:15m",
  "every:30m",
  "hourly",
  "weekdays",
  "daily",
  "weekly",
] as const;
export const CUSTOM_CADENCE = "custom";

/**
 * Action form. The cadence is a preset or `custom` + free text (`cron:<expr>` or
 * `every:<N>m|h`) — the server validates the text and returns a readable error.
 */
export function makeActionSchema(t: TFunction) {
  return z
    .object({
      prompt: z
        .string()
        .trim()
        .min(1, t("launchpad.action.form.prompt.required")),
      mcpServers: z.array(z.string()),
      allowWrites: z.boolean(),
      model: z.string(),
      cadencePreset: z.string(),
      customCadence: z.string().optional(),
      enabled: z.boolean(),
      notifyOn: z.enum(NOTIFY_ON),
    })
    .refine(
      (v) => v.cadencePreset !== CUSTOM_CADENCE || !!v.customCadence?.trim(),
      {
        path: ["customCadence"],
        message: t("launchpad.action.form.custom_cadence.required"),
      },
    );
}

export type ActionFormValues = z.infer<ReturnType<typeof makeActionSchema>>;

/** Server cadence → the form's preset + custom pair. */
export function splitCadence(cadence: string): {
  cadencePreset: string;
  customCadence: string;
} {
  return (CADENCE_PRESETS as readonly string[]).includes(cadence)
    ? { cadencePreset: cadence, customCadence: "" }
    : { cadencePreset: CUSTOM_CADENCE, customCadence: cadence };
}

export function joinCadence(values: ActionFormValues): string {
  return values.cadencePreset === CUSTOM_CADENCE
    ? (values.customCadence ?? "").trim()
    : values.cadencePreset;
}
