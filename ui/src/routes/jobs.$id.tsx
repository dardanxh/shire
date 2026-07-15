import { createFileRoute } from "@tanstack/react-router";

import { JobViewPage } from "@/features/jobs";

export const Route = createFileRoute("/jobs/$id")({
  staticData: { crumb: "jobs.view.crumb" },
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  return <JobViewPage id={id} />;
}
