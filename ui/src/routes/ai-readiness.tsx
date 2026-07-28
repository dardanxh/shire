import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AiReadinessOverviewPage } from "@/features/readiness";

const searchSchema = z.object({
  // The repository whose readiness is shown — deep-linkable.
  repo: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/ai-readiness")({
  validateSearch: searchSchema,
  component: AiReadinessOverviewPage,
  staticData: { crumb: "readiness.crumb" },
});
