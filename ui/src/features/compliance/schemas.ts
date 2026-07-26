import { z } from "zod";

export const COMPLIANCE_TABS = ["checker", "results"] as const;
export type ComplianceTab = (typeof COMPLIANCE_TABS)[number];

/** /compliance search: active tab, results-list pagination, and optional repository
 * preselection (the repositories list's "Run compliance" bulk action deep-links here). */
export const complianceSearchSchema = z.object({
  tab: z.enum(COMPLIANCE_TABS).catch("checker"),
  page: z.number().int().min(1).catch(1),
  size: z.number().int().min(1).max(100).catch(20),
  repos: z.array(z.string()).optional().catch(undefined),
});

export type ComplianceSearch = z.infer<typeof complianceSearchSchema>;
