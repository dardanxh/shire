import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { BlueprintDiagramPage } from "@/features/architectures";

const searchSchema = z.object({
  // Diagram kind to show (conceptual | logical | data_flow | sequence).
  view: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/architectures/$id/diagram")({
  component: BlueprintDiagramPage,
  validateSearch: searchSchema,
  staticData: { crumb: "blueprints.diagram.crumb", fullBleed: true },
});
