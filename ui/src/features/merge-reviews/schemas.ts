import { z } from "zod";

/**
 * Final-submit validation for the creation wizard. The wizard itself is
 * step-state (`useState` per field, like the ingest wizard — not RHF), so this
 * schema is the last gate before POST rather than a live form resolver.
 */
export const createMergeReviewSchema = z
  .object({
    repository_id: z.string().min(1),
    source_branch: z.string().min(1),
    target_branch: z.string().min(1),
    title: z.string().nullable(),
    hobit_slugs: z.array(z.string()),
  })
  .refine((v) => v.source_branch !== v.target_branch, {
    message: "Source and target must differ",
    path: ["target_branch"],
  });

export type CreateMergeReviewValues = z.infer<typeof createMergeReviewSchema>;
