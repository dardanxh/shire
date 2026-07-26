import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
  staticData: { crumb: "common.settings.title" },
  component: Outlet,
});
