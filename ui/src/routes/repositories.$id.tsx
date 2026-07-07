import { createFileRoute } from "@tanstack/react-router";

import { RepositoryViewPage } from "@/features/repositories";

export const Route = createFileRoute("/repositories/$id")({
  staticData: { crumb: "repositories.view.crumb" },
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  return <RepositoryViewPage id={id} />;
}
