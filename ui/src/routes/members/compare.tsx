import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { MembersComparePage } from "@/features/members";

const searchSchema = z.object({
  // Up to three member ids to compare side by side.
  ids: z.array(z.string()).optional().catch(undefined),
  anonymize: z.boolean().catch(false),
});

export const Route = createFileRoute("/members/compare")({
  validateSearch: searchSchema,
  component: MembersComparePage,
  staticData: { crumb: "members.compare.crumb" },
});
