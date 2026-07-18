import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout for the /council segment: renders only the matched child (the list,
 * the creation page, the detail) via <Outlet />.
 */
export const Route = createFileRoute("/council")({
  staticData: { crumb: "common.nav.council" },
  component: () => <Outlet />,
});
