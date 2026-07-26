import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/technologies")({
  component: Outlet,
  staticData: { crumb: "common.nav.technologies" },
});
