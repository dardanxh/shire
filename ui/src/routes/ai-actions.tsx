import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Layout for /ai-actions: the cards at `/ai-actions`, one action's report at `/ai-actions/$id`. */
export const Route = createFileRoute("/ai-actions")({
  staticData: { crumb: "ai_actions.crumb" },
  component: Outlet,
});
