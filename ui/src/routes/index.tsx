import { createFileRoute } from "@tanstack/react-router";

import { HomePage } from "@/features/home";

export const Route = createFileRoute("/")({
  staticData: { crumb: "common.nav.home" },
  component: HomePage,
});
