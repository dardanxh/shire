import { createFileRoute } from "@tanstack/react-router";

import { NewBlueprintPage } from "@/features/architectures";

export const Route = createFileRoute("/architectures/new")({
  component: NewBlueprintPage,
  staticData: { crumb: "blueprints.new.crumb" },
});
