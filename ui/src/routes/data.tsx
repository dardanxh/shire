import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/data")({
  component: Outlet,
  staticData: { crumb: "common.nav.modelling" },
});
