import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout for the /repositories segment: renders only the matched child (the
 * hub at `/repositories`, the detail at `/repositories/$id`) via <Outlet />.
 */
export const Route = createFileRoute("/repositories")({
  staticData: { crumb: "common.nav.repositories" },
  component: () => <Outlet />,
});
