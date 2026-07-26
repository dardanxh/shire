import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { TechnologiesComparePage } from "@/features/technologies";

const searchSchema = z.object({
  // Up to three technology ids to compare side by side.
  ids: z.array(z.string()).optional().catch(undefined),
});

export const Route = createFileRoute("/technologies/compare")({
  component: TechnologiesComparePage,
  validateSearch: searchSchema,
  staticData: { crumb: "technologies.compare.crumb" },
});
