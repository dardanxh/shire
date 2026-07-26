/** Default search for the list route — lands on the Data modelling tab. */
export const LIST_SEARCH = { tab: "modelling" } as const;

import type {
  ModellingComplexity,
  ModellingFamily,
  ModellingTopic,
} from "./schemas";

/** Filters for the strategy browse grid (server-side). */
export interface ModellingListParams {
  topic?: ModellingTopic;
  q?: string;
  family?: ModellingFamily;
  complexity?: ModellingComplexity;
}

export const modellingKeys = {
  all: ["modelling"] as const,
  lists: () => [...modellingKeys.all, "list"] as const,
  list: (params: ModellingListParams) =>
    [...modellingKeys.lists(), params] as const,
  details: () => [...modellingKeys.all, "detail"] as const,
  detail: (id: string) => [...modellingKeys.details(), id] as const,
};
