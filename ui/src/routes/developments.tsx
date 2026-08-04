import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { DevelopmentsPage } from "@/features/developments";

const searchSchema = z.object({
  tab: z.enum(["feed", "pulse"]).catch("feed"),
  // Pulse selection + interval live in the URL so comparisons are shareable.
  repos: z.array(z.string()).catch([]),
  range: z.enum(["today", "3d", "week", "month"]).catch("today"),
});

export const Route = createFileRoute("/developments")({
  component: DevelopmentsPage,
  validateSearch: searchSchema,
  staticData: { crumb: "common.nav.developments" },
});
