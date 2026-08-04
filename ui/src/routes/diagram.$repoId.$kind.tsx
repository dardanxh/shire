import { createFileRoute } from "@tanstack/react-router";

import { DiagramViewPage } from "@/features/repositories";

export const Route = createFileRoute("/diagram/$repoId/$kind")({
  staticData: {
    crumb: "repositories.view.architecture.crumb",
    fullBleed: true,
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { repoId, kind } = Route.useParams();
  return <DiagramViewPage repoId={repoId} kind={kind} />;
}
