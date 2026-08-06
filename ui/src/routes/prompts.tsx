import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/prompts")({
  staticData: { crumb: "common.nav.prompts" },
  component: Outlet,
});
