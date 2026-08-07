import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/prompts")({
  staticData: { crumb: "prompts.crumb" },
  component: Outlet,
});
