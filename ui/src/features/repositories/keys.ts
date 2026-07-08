/**
 * Query-key factory for the repositories feature. Inline string keys are not
 * allowed — everything hangs off `all` so a single `all` invalidation cascades
 * through TanStack's prefix matching (lists, details, and nested analysis).
 */
export interface RepositoryListParams {
  page: number;
  page_size: number;
}

export const repositoryKeys = {
  all: ["repositories"] as const,
  lists: () => [...repositoryKeys.all, "list"] as const,
  list: (params: RepositoryListParams) =>
    [...repositoryKeys.lists(), params] as const,
  details: () => [...repositoryKeys.all, "detail"] as const,
  detail: (id: string) => [...repositoryKeys.details(), id] as const,
  analysis: (id: string) => [...repositoryKeys.detail(id), "analysis"] as const,
  graph: (id: string) => [...repositoryKeys.detail(id), "graph"] as const,
  codeAge: (id: string) => [...repositoryKeys.detail(id), "code-age"] as const,
  coupling: (id: string) => [...repositoryKeys.detail(id), "coupling"] as const,
  codeMap: (id: string) => [...repositoryKeys.detail(id), "code-map"] as const,
  integrations: (id: string) =>
    [...repositoryKeys.detail(id), "integrations"] as const,
  toolLog: (id: string, tool: string) =>
    [...repositoryKeys.detail(id), "tool-log", tool] as const,
};
