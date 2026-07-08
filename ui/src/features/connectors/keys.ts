/**
 * Query-key factory for the connections feature. Everything hangs off `all` so
 * a single `all` invalidation cascades through TanStack's prefix matching.
 */
export interface ConnectionListParams {
  page: number;
  page_size: number;
}

export const connectionKeys = {
  all: ["connections"] as const,
  lists: () => [...connectionKeys.all, "list"] as const,
  list: (params: ConnectionListParams) =>
    [...connectionKeys.lists(), params] as const,
  details: () => [...connectionKeys.all, "detail"] as const,
  detail: (id: string) => [...connectionKeys.details(), id] as const,
};
