import { createFileRoute } from "@tanstack/react-router";

import { RegulationViewPage } from "@/features/security";

export const Route = createFileRoute("/security/regulations/$id")({
  component: RegulationViewPage,
  staticData: { crumb: "security.regulation.crumb" },
});
