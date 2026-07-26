import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { TechnologiesListPage } from "@/features/technologies";

// Filters live in the URL (per ui/CLAUDE.md); pagination does not — the grid is
// infinite-scroll, so pages are kept in memory by the infinite query, not the URL.
// `.catch()` per field so a malformed URL degrades to defaults instead of throwing.
const technologiesSearchSchema = z.object({
  tab: z.enum(["all", "starred"]).catch("all"),
  q: z.string().optional().catch(undefined),
  category: z.string().optional().catch(undefined),
  maturity: z.string().optional().catch(undefined),
  deployment: z.string().optional().catch(undefined),
  oss: z.boolean().optional().catch(undefined),
  time_to_win: z.string().optional().catch(undefined),
  cost_model: z.string().optional().catch(undefined),
  cost_tier: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/technologies/")({
  validateSearch: technologiesSearchSchema,
  component: TechnologiesListPage,
});
