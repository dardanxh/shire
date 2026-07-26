import { createFileRoute } from "@tanstack/react-router";

import { EditModellingStrategyPage } from "@/features/modelling";

export const Route = createFileRoute("/data/$id/edit")({
  component: EditModellingStrategyPage,
  staticData: { crumb: "modelling.edit.crumb" },
});
