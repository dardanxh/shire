import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Layout for /launchpad: the grid at `/launchpad`, a bookmark at `/launchpad/$id`. */
export const Route = createFileRoute("/launchpad")({
  staticData: { crumb: "common.nav.launchpad" },
  component: () => <Outlet />,
});
