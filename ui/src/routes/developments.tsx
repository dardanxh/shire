import { createFileRoute } from "@tanstack/react-router";

import { DevelopmentsPage } from "@/features/developments";

export const Route = createFileRoute("/developments")({
  component: DevelopmentsPage,
  staticData: { crumb: "common.nav.developments" },
});
