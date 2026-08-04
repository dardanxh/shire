import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { DevelopmentsPage } from "@/features/developments";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const searchSchema = z.object({
  tab: z.enum(["feed", "pulse"]).catch("feed"),
  // Pulse selection + interval live in the URL so comparisons are shareable.
  repos: z.array(z.string()).catch([]),
  range: z.enum(["today", "3d", "week", "month", "custom"]).catch("today"),
  // Custom interval bounds (local calendar days, inclusive) — only used when range=custom.
  from: z.string().regex(DAY).optional().catch(undefined),
  to: z.string().regex(DAY).optional().catch(undefined),
});

export const Route = createFileRoute("/developments")({
  component: DevelopmentsPage,
  validateSearch: searchSchema,
  staticData: { crumb: "common.nav.developments" },
});
