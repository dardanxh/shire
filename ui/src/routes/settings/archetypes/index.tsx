import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { ArchetypesListPage, FAMILIES } from "@/features/archetypes";

// `.catch()` per field so a malformed URL degrades to defaults instead of throwing.
const archetypesSearchSchema = z.object({
  page: z.number().int().min(1).catch(1),
  size: z.number().int().min(1).max(100).catch(20),
  family: z.enum(FAMILIES).optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  include_archived: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute("/settings/archetypes/")({
  validateSearch: archetypesSearchSchema,
  component: ArchetypesListPage,
});
