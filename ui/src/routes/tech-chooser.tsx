import { createFileRoute } from "@tanstack/react-router";

import {
  TechChooserPage,
  techChooserSearchSchema,
} from "@/features/techchoice";

export const Route = createFileRoute("/tech-chooser")({
  validateSearch: techChooserSearchSchema,
  component: TechChooserPage,
  staticData: { crumb: "techchoice.crumb" },
});
