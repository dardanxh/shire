import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  QUALITY_CATEGORIES,
  QUALITY_TABS,
  QualitiesListPage,
} from "@/features/qualities";

// Filters live in the URL; `.catch()` per field so bad URLs degrade to defaults.
const qualitiesSearchSchema = z.object({
  tab: z.enum(QUALITY_TABS).catch("catalog"),
  starred: z.boolean().optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  category: z.enum(QUALITY_CATEGORIES).optional().catch(undefined),
});

export const Route = createFileRoute("/qualities/")({
  validateSearch: qualitiesSearchSchema,
  component: QualitiesListPage,
});
