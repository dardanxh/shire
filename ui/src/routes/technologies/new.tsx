import { createFileRoute } from "@tanstack/react-router";

import { NewTechnologyPage } from "@/features/technologies";

export const Route = createFileRoute("/technologies/new")({
  component: NewTechnologyPage,
  staticData: { crumb: "technologies.new.crumb" },
});
