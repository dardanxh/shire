import { z } from "zod";

export const COMPLIANCE_TABS = ["checker", "results"] as const;
export type ComplianceTab = (typeof COMPLIANCE_TABS)[number];

/** /compliance search: active tab plus results-list pagination. */
export const complianceSearchSchema = z.object({
  tab: z.enum(COMPLIANCE_TABS).catch("checker"),
  page: z.number().int().min(1).catch(1),
  size: z.number().int().min(1).max(100).catch(20),
});

export type ComplianceSearch = z.infer<typeof complianceSearchSchema>;
