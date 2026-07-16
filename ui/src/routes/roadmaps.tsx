import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout for the /roadmaps segment: renders only the matched child (the list,
 * the creation page, the detail) via <Outlet />.
 */
export const Route = createFileRoute("/roadmaps")({
  staticData: { crumb: "common.nav.roadmaps" },
  component: () => <Outlet />,
});
