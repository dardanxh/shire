import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/qualities")({
  component: Outlet,
  staticData: { crumb: "common.nav.qualities" },
});
