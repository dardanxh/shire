import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/architectures")({
  component: Outlet,
  staticData: { crumb: "common.nav.architectures" },
});
