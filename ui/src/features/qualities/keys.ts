/** Default search for the list route — lands on the Catalog tab. */
export const LIST_SEARCH = { tab: "catalog" } as const;

import type { QualityCategory } from "./schemas";

/** Filters for the qualities catalog (server-side). */
export interface QualityListParams {
  q?: string;
  category?: QualityCategory;
}

export const qualityKeys = {
  all: ["qualities"] as const,
  lists: () => [...qualityKeys.all, "list"] as const,
  list: (params: QualityListParams) =>
    [...qualityKeys.lists(), params] as const,
  details: () => [...qualityKeys.all, "detail"] as const,
  detail: (id: string) => [...qualityKeys.details(), id] as const,
};
