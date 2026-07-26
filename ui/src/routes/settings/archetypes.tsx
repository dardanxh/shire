import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/archetypes")({
  component: Outlet,
  staticData: { crumb: "archetypes.crumb" },
});
