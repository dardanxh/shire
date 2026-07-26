import { createFileRoute } from "@tanstack/react-router";

import { AdvisorPage } from "@/features/architectures";

export const Route = createFileRoute("/architectures/advisor")({
  component: AdvisorPage,
  staticData: { crumb: "blueprints.advisor.crumb" },
});
