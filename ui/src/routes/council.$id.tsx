import { createFileRoute } from "@tanstack/react-router";

import { CouncilViewPage } from "@/features/council";

export const Route = createFileRoute("/council/$id")({
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  return <CouncilViewPage id={id} />;
}
