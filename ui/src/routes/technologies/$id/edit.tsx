import { createFileRoute } from "@tanstack/react-router";

import { EditTechnologyPage } from "@/features/technologies";

export const Route = createFileRoute("/technologies/$id/edit")({
  component: EditTechnologyPage,
  staticData: { crumb: "technologies.edit.crumb" },
});
