import { createFileRoute } from "@tanstack/react-router";

import { EditArchetypePage } from "@/features/archetypes";

export const Route = createFileRoute("/settings/archetypes/$id/edit")({
  component: EditArchetypePage,
  staticData: { crumb: "archetypes.edit.crumb" },
});
