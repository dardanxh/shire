import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { BlueprintsListPage } from "@/features/architectures";

// `.catch()` per field so a malformed URL degrades to defaults instead of throwing.
const architecturesSearchSchema = z.object({
  tab: z.enum(["blueprints", "mine"]).catch("blueprints"),
  starred: z.boolean().optional().catch(undefined),
  family_tag: z.string().optional().catch(undefined),
  use_case: z.string().optional().catch(undefined),
  q: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/architectures/")({
  validateSearch: architecturesSearchSchema,
  component: BlueprintsListPage,
});
