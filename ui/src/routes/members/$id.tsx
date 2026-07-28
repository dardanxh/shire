import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { MemberDashboardPage } from "@/features/members";

const searchSchema = z.object({
  anonymize: z.boolean().catch(false),
});

export const Route = createFileRoute("/members/$id")({
  validateSearch: searchSchema,
  component: MemberDashboardPage,
  staticData: { crumb: "members.dashboard.crumb" },
});
