import { z } from "zod";

/**
 * Form schema for creating a prompt. Deliberately not `.default()` anywhere: it creates an
 * input/output type mismatch that breaks `standardSchemaResolver` typing, so defaults live on
 * react-hook-form's `defaultValues` instead.
 */
export const promptFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(4000),
  /** Comma-separated in the field; split into an array in the submit handler. */
  tags: z.string().max(400),
  body: z.string().min(1, "A prompt cannot be blank").max(400_000),
  guidance: z.string().max(20_000),
});

export type PromptFormValues = z.infer<typeof promptFormSchema>;

/** Mirrors the backend `Archetype` / `OutputFormat` enums (prompts/domain.py). */
export const ARCHETYPES = [
  "clear_crisp",
  "straight_to_point",
  "politically_correct",
  "aggressive",
  "well_organized",
  "action_oriented",
] as const;

export const OUTPUT_FORMATS = [
  "none",
  "markdown",
  "json",
  "plain",
  "table",
] as const;

/** The tuning knobs. No `.default()` — RHF holds the defaults (see `EMPTY_TUNING`). */
export const tuningFormSchema = z.object({
  criticality: z.number().int().min(1).max(5),
  sensitivity: z.number().int().min(1).max(5),
  verbosity: z.number().int().min(1).max(5),
  archetype: z.enum(ARCHETYPES),
  output_format: z.enum(OUTPUT_FORMATS),
  disclaimer: z.boolean(),
  disclaimer_text: z.string().max(2000),
  keywords: z.array(z.string()),
  audience: z.string().max(500),
  target_model: z.string(),
});

export type TuningFormValues = z.infer<typeof tuningFormSchema>;

/** What an untuned version means: a clear, moderately detailed prompt, no extra ceremony. */
export const EMPTY_TUNING: TuningFormValues = {
  criticality: 3,
  sensitivity: 1,
  verbosity: 3,
  archetype: "clear_crisp",
  output_format: "none",
  disclaimer: false,
  disclaimer_text: "",
  keywords: [],
  audience: "",
  target_model: "sonnet",
};
