import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { NewModellingStrategyPage, TOPICS } from "@/features/modelling";

export const Route = createFileRoute("/data/new")({
  // The list's active tab pre-selects the form's topic.
  validateSearch: z.object({ topic: z.enum(TOPICS).catch("modelling") }),
  component: NewModellingStrategyPage,
  staticData: { crumb: "modelling.new.crumb" },
});
