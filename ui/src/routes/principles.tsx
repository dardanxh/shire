import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { PrinciplesListPage } from "@/features/principles";
import { PRINCIPLE_SEVERITIES, PRINCIPLE_TECHS } from "@/lib/api";

// Filters live in the URL; `.catch()` per field so bad URLs degrade to defaults.
const principlesSearchSchema = z.object({
  severity: z.enum(PRINCIPLE_SEVERITIES).optional().catch(undefined),
  tech: z.enum(PRINCIPLE_TECHS).optional().catch(undefined),
});

export const Route = createFileRoute("/principles")({
  validateSearch: principlesSearchSchema,
  staticData: { crumb: "common.nav.principles" },
  component: PrinciplesListPage,
});
