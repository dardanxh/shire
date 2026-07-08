import { createFileRoute } from "@tanstack/react-router";

import { BriefingPage } from "@/features/briefing";

export const Route = createFileRoute("/briefing")({
  staticData: { crumb: "common.nav.briefing" },
  component: BriefingPage,
});
