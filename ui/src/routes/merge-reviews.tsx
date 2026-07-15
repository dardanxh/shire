import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout for the /merge-reviews segment: renders only the matched child (the
 * list at `/merge-reviews`, the detail at `/merge-reviews/$id`) via <Outlet />.
 */
export const Route = createFileRoute("/merge-reviews")({
  staticData: { crumb: "common.nav.merge_reviews" },
  component: () => <Outlet />,
});
