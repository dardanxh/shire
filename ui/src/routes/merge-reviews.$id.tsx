import { createFileRoute } from "@tanstack/react-router";

import { MergeReviewViewPage } from "@/features/merge-reviews";

export const Route = createFileRoute("/merge-reviews/$id")({
  staticData: { crumb: "merge_reviews.view.crumb" },
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  return <MergeReviewViewPage id={id} />;
}
