import type { TFunction } from "i18next";
import { z } from "zod";

/** Fixed schedule choices; anything else is entered as a custom schedule string. */
export const SCHEDULE_PRESETS = [
  "manual",
  "every:15m",
  "every:30m",
  "hourly",
  "every:4h",
  "weekdays",
  "daily",
  "weekly",
] as const;
export const CUSTOM_SCHEDULE = "custom";

/** Run time limits offered in the form, in minutes (the API caps at 60). */
export const TIMEOUT_MINUTES = [
  "5",
  "10",
  "15",
  "20",
  "30",
  "45",
  "60",
] as const;

/** "" in the model select = the engine default (the API wants null). */
export const DEFAULT_MODEL = "";

/**
 * Create/edit form. The schedule is a preset or `custom` + free text (`cron:<expr>` or
 * `every:<N>m|h`) — the server validates the text and returns a readable error.
 */
export function makeAiActionSchema(t: TFunction) {
  return z
    .object({
      title: z.string().trim().min(1, t("ai_actions.form.title.required")),
      prompt: z.string().trim().min(1, t("ai_actions.form.prompt.required")),
      model: z.string(),
      schedulePreset: z.string(),
      customSchedule: z.string().optional(),
      enabled: z.boolean(),
      allowShell: z.boolean(),
      // A select of TIMEOUT_MINUTES as strings (no z.coerce: it splits the resolver's
      // input/output types).
      timeoutMinutes: z.string(),
    })
    .refine(
      (v) => v.schedulePreset !== CUSTOM_SCHEDULE || !!v.customSchedule?.trim(),
      {
        path: ["customSchedule"],
        message: t("ai_actions.form.custom_schedule.required"),
      },
    );
}

export type AiActionFormValues = z.infer<ReturnType<typeof makeAiActionSchema>>;

/** Server schedule → the form's preset + custom pair. */
export function splitSchedule(schedule: string): {
  schedulePreset: string;
  customSchedule: string;
} {
  return (SCHEDULE_PRESETS as readonly string[]).includes(schedule)
    ? { schedulePreset: schedule, customSchedule: "" }
    : { schedulePreset: CUSTOM_SCHEDULE, customSchedule: schedule };
}

export function joinSchedule(
  values: Pick<AiActionFormValues, "schedulePreset" | "customSchedule">,
): string {
  return values.schedulePreset === CUSTOM_SCHEDULE
    ? (values.customSchedule ?? "").trim()
    : values.schedulePreset;
}
