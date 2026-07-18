import { createFileRoute } from "@tanstack/react-router";

import { NewCouncilPage } from "@/features/council";

export const Route = createFileRoute("/council/new")({
  staticData: { crumb: "council.new.crumb" },
  component: NewCouncilPage,
});
