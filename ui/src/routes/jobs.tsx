import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout for the /jobs segment: renders only the matched child (the list at
 * `/jobs`, the detail at `/jobs/$id`) via <Outlet />.
 */
export const Route = createFileRoute("/jobs")({
  staticData: { crumb: "common.nav.jobs" },
  component: () => <Outlet />,
});
