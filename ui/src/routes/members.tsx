import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/members")({
  component: Outlet,
  staticData: { crumb: "common.nav.members" },
});
