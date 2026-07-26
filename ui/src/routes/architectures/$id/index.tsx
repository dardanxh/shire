import { createFileRoute } from "@tanstack/react-router";

import {
  BlueprintViewPage,
  blueprintQueryOptions,
} from "@/features/architectures";
import { queryClient } from "@/lib/query-client";

export const Route = createFileRoute("/architectures/$id/")({
  component: BlueprintViewPage,
  // Warm the detail query and surface the architecture's name as the breadcrumb.
  // Non-fatal on error: the page renders its own error state.
  loader: async ({ params }) => {
    try {
      const blueprint = await queryClient.ensureQueryData(
        blueprintQueryOptions(params.id),
      );
      return { crumb: blueprint.name };
    } catch {
      return {};
    }
  },
  staticData: { crumb: "blueprints.view.crumb" },
});
