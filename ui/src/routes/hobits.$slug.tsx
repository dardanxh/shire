import { createFileRoute } from "@tanstack/react-router";

import { HobitViewPage } from "@/features/hobits";

export const Route = createFileRoute("/hobits/$slug")({
  staticData: { crumb: "hobits.view.crumb" },
  component: RouteComponent,
});

function RouteComponent() {
  const { slug } = Route.useParams();
  return <HobitViewPage slug={slug} />;
}
