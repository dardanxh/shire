import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  COMPLEXITIES,
  FAMILIES,
  ModellingStrategiesListPage,
  TOPICS,
} from "@/features/modelling";

// Filters live in the URL; `.catch()` per field so bad URLs degrade to defaults.
const modellingSearchSchema = z.object({
  tab: z.enum(TOPICS).catch("modelling"),
  q: z.string().optional().catch(undefined),
  family: z
    .enum(FAMILIES as [(typeof FAMILIES)[number], ...typeof FAMILIES])
    .optional()
    .catch(undefined),
  complexity: z.enum(COMPLEXITIES).optional().catch(undefined),
});

export const Route = createFileRoute("/data/")({
  validateSearch: modellingSearchSchema,
  component: ModellingStrategiesListPage,
});
