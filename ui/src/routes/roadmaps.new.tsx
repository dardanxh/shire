import { createFileRoute } from "@tanstack/react-router";

import { NewRoadmapPage } from "@/features/roadmaps";

export const Route = createFileRoute("/roadmaps/new")({
  staticData: { crumb: "roadmaps.new.crumb" },
  component: NewRoadmapPage,
});
