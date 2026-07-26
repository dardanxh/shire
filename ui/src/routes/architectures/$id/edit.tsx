import { createFileRoute } from "@tanstack/react-router";

import { EditBlueprintPage } from "@/features/architectures";

export const Route = createFileRoute("/architectures/$id/edit")({
  component: EditBlueprintPage,
  staticData: { crumb: "blueprints.edit.crumb" },
});
