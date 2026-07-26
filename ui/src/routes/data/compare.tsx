import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { ModellingComparePage, TOPICS } from "@/features/modelling";

const searchSchema = z.object({
  topic: z.enum(TOPICS).catch("modelling"),
  // Up to three strategy ids to compare side by side.
  ids: z.array(z.string()).optional().catch(undefined),
});

export const Route = createFileRoute("/data/compare")({
  component: ModellingComparePage,
  validateSearch: searchSchema,
  staticData: { crumb: "modelling.compare.crumb" },
});
