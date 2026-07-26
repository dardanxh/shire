import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { ComparePage } from "@/features/architectures";

const searchSchema = z.object({
  // Up to three blueprint ids to compare side by side.
  ids: z.array(z.string()).optional().catch(undefined),
});

export const Route = createFileRoute("/architectures/compare")({
  component: ComparePage,
  validateSearch: searchSchema,
  staticData: { crumb: "blueprints.compare.crumb" },
});
