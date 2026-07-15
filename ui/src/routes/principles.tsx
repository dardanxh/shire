import { createFileRoute } from "@tanstack/react-router";

import { PrinciplesListPage } from "@/features/principles";

export const Route = createFileRoute("/principles")({
  staticData: { crumb: "common.nav.principles" },
  component: PrinciplesListPage,
});
