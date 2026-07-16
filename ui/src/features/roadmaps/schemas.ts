import { z } from "zod";

/**
 * The create/edit form. `goal` is optional in UX (empty string → null in the
 * submit handler); `repository_ids` needs at least one selection.
 */
export const roadmapFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  goal: z.string().max(4000),
  repository_ids: z.array(z.string()).min(1, "Select at least one repository"),
});

export type RoadmapFormValues = z.infer<typeof roadmapFormSchema>;
