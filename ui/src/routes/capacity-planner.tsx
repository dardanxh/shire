import { createFileRoute } from "@tanstack/react-router";

import {
  CapacityPlannerPage,
  capacityPlannerSearchSchema,
} from "@/features/sizing";

export const Route = createFileRoute("/capacity-planner")({
  validateSearch: capacityPlannerSearchSchema,
  component: CapacityPlannerPage,
  staticData: { crumb: "sizing.crumb" },
});
