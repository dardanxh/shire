import { createFileRoute } from "@tanstack/react-router";

import { CompliancePage, complianceSearchSchema } from "@/features/compliance";

export const Route = createFileRoute("/compliance")({
  validateSearch: complianceSearchSchema,
  component: CompliancePage,
  staticData: { crumb: "compliance.crumb" },
});
