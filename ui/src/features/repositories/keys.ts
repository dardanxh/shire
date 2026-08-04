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
  // Cross-repo inspection counts + activity for the list's derived columns.
  inspectionsOverview: (days: number) =>
    [...repositoryKeys.all, "inspections-overview", days] as const,
  details: () => [...repositoryKeys.all, "detail"] as const,
  detail: (id: string) => [...repositoryKeys.details(), id] as const,
  analysis: (id: string) => [...repositoryKeys.detail(id), "analysis"] as const,
  analysisHistory: (id: string) =>
    [...repositoryKeys.detail(id), "analysis-history"] as const,
  analysisDelta: (id: string, fromId: string | null, toId: string | null) =>
    [...repositoryKeys.detail(id), "analysis-delta", fromId, toId] as const,
  artifactVersions: (id: string, artifact: string, kind: string | null) =>
    [
      ...repositoryKeys.detail(id),
      "artifact-versions",
      artifact,
      kind,
    ] as const,
  branches: (id: string) => [...repositoryKeys.detail(id), "branches"] as const,
  branchNames: (id: string) =>
    [...repositoryKeys.detail(id), "branch-names"] as const,
  context: (id: string) => [...repositoryKeys.detail(id), "context"] as const,
  hobitRuns: (id: string) =>
    [...repositoryKeys.detail(id), "hobit-runs"] as const,
  hobits: (id: string) => [...repositoryKeys.detail(id), "hobits"] as const,
  graph: (id: string) => [...repositoryKeys.detail(id), "graph"] as const,
  codeAge: (id: string) => [...repositoryKeys.detail(id), "code-age"] as const,
  coupling: (id: string) => [...repositoryKeys.detail(id), "coupling"] as const,
  dependencyFreshness: (id: string) =>
    [...repositoryKeys.detail(id), "dependency-freshness"] as const,
  dependencies: (id: string) =>
    [...repositoryKeys.detail(id), "dependencies"] as const,
  cicd: (id: string) => [...repositoryKeys.detail(id), "cicd"] as const,
  architecture: (id: string) =>
    [...repositoryKeys.detail(id), "architecture"] as const,
  codebaseOverview: (id: string) =>
    [...repositoryKeys.detail(id), "codebase-overview"] as const,
  techStack: (id: string) =>
    [...repositoryKeys.detail(id), "tech-stack"] as const,
  aiReadiness: (id: string) =>
    [...repositoryKeys.detail(id), "ai-readiness"] as const,
  codeMap: (id: string) => [...repositoryKeys.detail(id), "code-map"] as const,
  integrations: (id: string) =>
    [...repositoryKeys.detail(id), "integrations"] as const,
  inspections: (id: string) =>
    [...repositoryKeys.detail(id), "inspections"] as const,
  toolLog: (id: string, tool: string) =>
    [...repositoryKeys.detail(id), "tool-log", tool] as const,
  questions: (id: string) =>
    [...repositoryKeys.detail(id), "questions"] as const,
};
