/**
 * Default search for the list route. The list is now infinite-scroll, so pagination
 * lives in memory (not the URL) and the defaults are just "no filters".
 */
export const LIST_SEARCH = {} as const;

/** Filters for the corpus browse grid (server-side; pagination handled by the infinite query). */
export interface TechnologyListParams {
  q?: string;
  category?: string;
  maturity?: string;
  deployment?: string;
  oss?: boolean;
  starred?: boolean;
  time_to_win?: string;
  cost_model?: string;
  cost_tier?: string;
  order_by?: string;
}

/**
 * Query-key factory. Categories nest under the same root so invalidating
 * `technologyKeys.all` refreshes the category tree too (counts change with
 * every technology mutation).
 */
export const technologyKeys = {
  all: ["technologies"] as const,
  lists: () => [...technologyKeys.all, "list"] as const,
  list: (params: TechnologyListParams) =>
    [...technologyKeys.lists(), params] as const,
  infinite: (params: TechnologyListParams) =>
    [...technologyKeys.all, "infinite", params] as const,
  details: () => [...technologyKeys.all, "detail"] as const,
  detail: (id: string) => [...technologyKeys.details(), id] as const,
  categories: () => [...technologyKeys.all, "categories"] as const,
  corpus: () => [...technologyKeys.all, "corpus"] as const,
};
