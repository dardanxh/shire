import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout for the /hobits segment: renders only the matched child (the list at `/hobits`, the
 * detail at `/hobits/$slug`) via <Outlet />, so the detail replaces the list rather than nesting
 * under it.
 */
export const Route = createFileRoute("/hobits")({
  staticData: { crumb: "common.nav.hobits" },
  component: () => <Outlet />,
});
