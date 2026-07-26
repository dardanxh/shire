import { createFileRoute } from "@tanstack/react-router";

import { CalculatorPage, sizingSearchSchema } from "@/features/sizing";

export const Route = createFileRoute("/sizing")({
  validateSearch: sizingSearchSchema,
  component: CalculatorPage,
  staticData: { crumb: "sizing.crumb" },
});
