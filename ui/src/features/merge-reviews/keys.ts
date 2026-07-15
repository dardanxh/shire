/**
 * Query-key factory for the merge-reviews feature. Everything hangs off `all`
 * so a single `all` invalidation cascades through TanStack's prefix matching.
 */
export interface MergeReviewListParams {
  page: number;
  page_size: number;
  repository_id?: string;
}

export const mergeReviewKeys = {
  all: ["merge-reviews"] as const,
  lists: () => [...mergeReviewKeys.all, "list"] as const,
  list: (params: MergeReviewListParams) =>
    [...mergeReviewKeys.lists(), params] as const,
  details: () => [...mergeReviewKeys.all, "detail"] as const,
  detail: (id: string) => [...mergeReviewKeys.details(), id] as const,
};
