import { createFileRoute } from "@tanstack/react-router";

import { AiActionsPage } from "@/features/ai-actions";

export const Route = createFileRoute("/ai-actions/")({
  component: AiActionsPage,
});
