import { createFileRoute } from "@tanstack/react-router";

import { AiActionViewPage } from "@/features/ai-actions";

export const Route = createFileRoute("/ai-actions/$id")({
  staticData: { crumb: "ai_actions.view_crumb" },
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  return <AiActionViewPage id={id} />;
}
