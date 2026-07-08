import { createFileRoute } from "@tanstack/react-router";

import { HobitsListPage } from "@/features/hobits";

export const Route = createFileRoute("/hobits/")({
  component: HobitsListPage,
});
