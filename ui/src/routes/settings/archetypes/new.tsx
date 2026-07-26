import { createFileRoute } from "@tanstack/react-router";

import { NewArchetypePage } from "@/features/archetypes";

export const Route = createFileRoute("/settings/archetypes/new")({
  component: NewArchetypePage,
  staticData: { crumb: "archetypes.new.crumb" },
});
