import { z } from "zod";

/** Create/edit team form schema. `t` injects localized validation messages. */
export function makeTeamSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().trim().min(1, t("teams.form.name_required")),
    color: z
      .string()
      .trim()
      .regex(
        /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/,
        t("teams.form.color_invalid"),
      ),
    description: z.string().trim().optional(),
  });
}

export type TeamFormValues = z.infer<ReturnType<typeof makeTeamSchema>>;

/** Palette offered in the color picker (matches the backend default palette). */
export const TEAM_PALETTE = [
  "#2563eb",
  "#16a34a",
  "#db2777",
  "#f59e0b",
  "#7c3aed",
  "#0891b2",
  "#dc2626",
  "#65a30d",
  "#c026d3",
  "#0d9488",
] as const;
