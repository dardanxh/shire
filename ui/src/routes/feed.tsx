import { createFileRoute } from "@tanstack/react-router";

import { BriefingPage } from "@/features/briefing";

export const Route = createFileRoute("/feed")({
  staticData: { crumb: "common.nav.feed" },
  component: BriefingPage,
});
