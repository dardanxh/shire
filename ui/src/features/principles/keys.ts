/**
 * Query-key factory for the principles feature. Everything hangs off `all` so a
 * single `all` invalidation cascades through TanStack's prefix matching.
 */
export const principleKeys = {
  all: ["principles"] as const,
  lists: () => [...principleKeys.all, "list"] as const,
  repo: (repositoryId: string) =>
    [...principleKeys.all, "repo", repositoryId] as const,
};
