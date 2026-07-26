import { createFileRoute } from "@tanstack/react-router";

import { QualityViewPage } from "@/features/qualities";

export const Route = createFileRoute("/qualities/$id")({
  component: QualityViewPage,
  staticData: { crumb: "qualities.view.crumb" },
});
