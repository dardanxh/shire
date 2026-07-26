import { createFileRoute } from "@tanstack/react-router";

import { AiReadinessOverviewPage } from "@/features/readiness";

export const Route = createFileRoute("/ai-readiness")({
  component: AiReadinessOverviewPage,
  staticData: { crumb: "readiness.crumb" },
});
