/**
 * Query-key factory for the prompts feature. Everything hangs off `all` so a single `all`
 * invalidation cascades through TanStack's prefix matching.
 */
export interface PromptListParams {
  page: number;
  page_size: number;
}

export const promptKeys = {
  all: ["prompts"] as const,
  lists: () => [...promptKeys.all, "list"] as const,
  list: (params: PromptListParams) => [...promptKeys.lists(), params] as const,
  details: () => [...promptKeys.all, "detail"] as const,
  detail: (id: string) => [...promptKeys.details(), id] as const,
  versions: (id: string) => [...promptKeys.detail(id), "versions"] as const,
  metrics: (id: string) => [...promptKeys.detail(id), "metrics"] as const,
  /** The stateless analyse call, keyed by body so identical text is served from cache. */
  analysis: (body: string) => [...promptKeys.all, "analysis", body] as const,
};
