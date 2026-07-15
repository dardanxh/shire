/**
 * Query-key factory for the jobs feature. Everything hangs off `all` so a
 * single `all` invalidation cascades through TanStack's prefix matching.
 */
export interface JobListParams {
  page: number;
  page_size: number;
  status?: string;
}

export const jobKeys = {
  all: ["jobs"] as const,
  lists: () => [...jobKeys.all, "list"] as const,
  list: (params: JobListParams) => [...jobKeys.lists(), params] as const,
  details: () => [...jobKeys.all, "detail"] as const,
  detail: (id: string) => [...jobKeys.details(), id] as const,
};
