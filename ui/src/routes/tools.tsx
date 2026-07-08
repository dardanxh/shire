import { createFileRoute } from "@tanstack/react-router";

import { ToolsListPage } from "@/features/tools";

export const Route = createFileRoute("/tools")({
  staticData: { crumb: "common.nav.tools" },
  component: ToolsListPage,
});
