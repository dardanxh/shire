import { createFileRoute } from "@tanstack/react-router";

import { ModellingStrategyViewPage } from "@/features/modelling";

export const Route = createFileRoute("/data/$id/")({
  component: ModellingStrategyViewPage,
  staticData: { crumb: "modelling.view.crumb" },
});
