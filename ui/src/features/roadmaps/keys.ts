/**
 * Query-key factory for the roadmaps feature. Everything hangs off `all` so a
 * single `all` invalidation cascades through TanStack's prefix matching.
 */
export interface RoadmapListParams {
  page: number;
  page_size: number;
}

export const roadmapKeys = {
  all: ["roadmaps"] as const,
  lists: () => [...roadmapKeys.all, "list"] as const,
  list: (params: RoadmapListParams) =>
    [...roadmapKeys.lists(), params] as const,
  details: () => [...roadmapKeys.all, "detail"] as const,
  detail: (id: string, version?: number) =>
    [...roadmapKeys.details(), id, version ?? "current"] as const,
  versions: (id: string) => [...roadmapKeys.all, "versions", id] as const,
  burnup: (id: string) => [...roadmapKeys.all, "burnup", id] as const,
  radar: (id: string) => [...roadmapKeys.all, "radar", id] as const,
  drift: (id: string) => [...roadmapKeys.all, "drift", id] as const,
  repoSlices: (repositoryId: string) =>
    [...roadmapKeys.all, "repo", repositoryId] as const,
};
