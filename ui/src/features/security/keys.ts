/** Default search for the list route — lands on the Regulations tab. */
export const LIST_SEARCH = { tab: "regulations" } as const;

import type {
  PracticeCategory,
  PracticeComplexity,
  RegulationCategory,
  RegulationRegion,
} from "./schemas";

/** Filters for the regulation browse grid (server-side). */
export interface RegulationListParams {
  q?: string;
  category?: RegulationCategory;
  region?: RegulationRegion;
  /** true = starred only. */
  starred?: boolean;
}

/** Filters for the practice browse grid (server-side). */
export interface PracticeListParams {
  q?: string;
  category?: PracticeCategory;
  complexity?: PracticeComplexity;
  /** true = starred only. */
  starred?: boolean;
}

export const securityKeys = {
  all: ["security"] as const,
  regulationLists: () => [...securityKeys.all, "regulations", "list"] as const,
  regulationList: (params: RegulationListParams) =>
    [...securityKeys.regulationLists(), params] as const,
  regulationDetails: () =>
    [...securityKeys.all, "regulations", "detail"] as const,
  regulation: (id: string) =>
    [...securityKeys.regulationDetails(), id] as const,
  practiceLists: () => [...securityKeys.all, "practices", "list"] as const,
  practiceList: (params: PracticeListParams) =>
    [...securityKeys.practiceLists(), params] as const,
  practiceDetails: () => [...securityKeys.all, "practices", "detail"] as const,
  practice: (id: string) => [...securityKeys.practiceDetails(), id] as const,
};
