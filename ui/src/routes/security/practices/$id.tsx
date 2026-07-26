import { createFileRoute } from "@tanstack/react-router";

import { PracticeViewPage } from "@/features/security";

export const Route = createFileRoute("/security/practices/$id")({
  component: PracticeViewPage,
  staticData: { crumb: "security.practice.crumb" },
});
