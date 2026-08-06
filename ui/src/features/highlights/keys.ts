/**
 * Query-key factory for the highlights feature. Everything hangs off `all` so a
 * single `all` invalidation cascades through TanStack's prefix matching.
 */
export interface HighlightListParams {
  page: number;
  page_size: number;
}

export const highlightKeys = {
  all: ["highlights"] as const,
  lists: () => [...highlightKeys.all, "list"] as const,
  list: (params: HighlightListParams) =>
    [...highlightKeys.lists(), params] as const,
};
