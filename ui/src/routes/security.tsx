import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/security")({
  component: Outlet,
  staticData: { crumb: "common.nav.security" },
});
