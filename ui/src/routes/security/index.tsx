import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  COMPLEXITIES,
  PRACTICE_CATEGORIES,
  REGIONS,
  REGULATION_CATEGORIES,
  SECURITY_TABS,
  SecurityListPage,
} from "@/features/security";

// Filters live in the URL; `.catch()` per field so bad URLs degrade to defaults.
const securitySearchSchema = z.object({
  tab: z.enum(SECURITY_TABS).catch("regulations"),
  q: z.string().optional().catch(undefined),
  category: z
    .enum([...REGULATION_CATEGORIES, ...PRACTICE_CATEGORIES])
    .optional()
    .catch(undefined),
  region: z.enum(REGIONS).optional().catch(undefined),
  complexity: z.enum(COMPLEXITIES).optional().catch(undefined),
});

export const Route = createFileRoute("/security/")({
  validateSearch: securitySearchSchema,
  component: SecurityListPage,
});
