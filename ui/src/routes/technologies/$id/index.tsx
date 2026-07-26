import { createFileRoute } from "@tanstack/react-router";

import { TechnologyViewPage } from "@/features/technologies";

export const Route = createFileRoute("/technologies/$id/")({
  component: TechnologyViewPage,
  staticData: { crumb: "technologies.view.crumb" },
});
