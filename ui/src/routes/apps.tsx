import { createFileRoute } from "@tanstack/react-router";

import { AppsPage } from "@/features/apps";

export const Route = createFileRoute("/apps")({
  component: AppsPage,
  staticData: { crumb: "apps.crumb" },
});
