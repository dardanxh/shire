import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type AnalysisOut,
  type ArchitectureOut,
  api,
  type BranchesOut,
  type BranchNamesOut,
  type CodeAgeOut,
  type CodebaseOverviewOut,
  type CodeMapOut,
  type ContextMarkdownOut,
  type CouplingOut,
  type DependencyFreshnessOut,
  type GraphOut,
  type HobitOut,
  type HobitRunOut,
  type RepositoryOut,
  type ToolLogOut,
  type ToolName,
} from "@/lib/api";
import { type RepositoryListParams, repositoryKeys } from "./keys";

/** List repositories (server-paginated: returns the `Page` envelope). */
export function useRepositoriesQuery(params: RepositoryListParams) {
  return useQuery({
    queryKey: repositoryKeys.list(params),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/repositories", {
        params: { query: params },
      });
      if (error) throw error;
      return data;
    },
  });
}

/** A single repository by id. Disabled while `id` is empty. */
export function useRepositoryQuery(id: string) {
  return useQuery({
    queryKey: repositoryKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/**
 * A repository's latest analysis. Resolves to `null` (not an error) when the
 * backend has no analysis yet (404), so the view can show a "pending" state.
 */
export function useAnalysisQuery(id: string) {
  return useQuery<AnalysisOut | null>({
    queryKey: repositoryKeys.analysis(id),
    queryFn: async () => {
      const { data, error, response } = await api.GET(
        "/api/v1/repositories/{repository_id}/analysis",
        { params: { path: { repository_id: id } } },
      );
      if (response.status === 404) return null;
      if (error) throw error;
      return data ?? null;
    },
    enabled: id !== "",
  });
}

/**
 * Live branch overview: count, merged/stale tallies, and the most active branch
 * tips. Computed against the clone on request (with a best-effort remote fetch),
 * so a `staleTime` keeps tab flips from re-triggering that work.
 */
export function useBranchesQuery(id: string) {
  return useQuery<BranchesOut>({
    queryKey: repositoryKeys.branches(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/branches",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
    staleTime: 60_000,
  });
}

/**
 * Every branch name (cheap, no per-branch plumbing) — feeds branch pickers.
 * Unlike `useBranchesQuery` this is the complete list, not the top active tips.
 */
export function useBranchNamesQuery(id: string) {
  return useQuery<BranchNamesOut>({
    queryKey: repositoryKeys.branchNames(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/branches/names",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
    staleTime: 60_000,
  });
}

/**
 * A repository's context pack rendered as Markdown — the generated text plus any saved
 * user override (`edited`) and the `effective` one the agent reads. Resolves to `null`
 * (not an error) when the backend has no analysis yet (404), mirroring `useAnalysisQuery`.
 */
export function useContextMarkdownQuery(id: string) {
  return useQuery<ContextMarkdownOut | null>({
    queryKey: repositoryKeys.context(id),
    queryFn: async () => {
      const { data, error, response } = await api.GET(
        "/api/v1/repositories/{repository_id}/context/markdown",
        { params: { path: { repository_id: id } } },
      );
      if (response.status === 404) return null;
      if (error) throw error;
      return data ?? null;
    },
    enabled: id !== "",
  });
}

/** Save a user-authored Markdown override for a repository's context. */
export function useSaveContextMarkdownMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (markdown: string): Promise<ContextMarkdownOut> => {
      const { data, error } = await api.PUT(
        "/api/v1/repositories/{repository_id}/context/markdown",
        { params: { path: { repository_id: id } }, body: { markdown } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(repositoryKeys.context(id), data);
    },
  });
}

/** Drop the override and fall back to the generated Markdown. */
export function useResetContextMarkdownMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ContextMarkdownOut> => {
      const { data, error } = await api.DELETE(
        "/api/v1/repositories/{repository_id}/context/markdown",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(repositoryKeys.context(id), data);
    },
  });
}

/** This repository's hobit runs, newest first. */
export function useRepoHobitRunsQuery(id: string) {
  return useQuery<HobitRunOut[]>({
    queryKey: repositoryKeys.hobitRuns(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/hobits/runs",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/**
 * Run the Repo-Onboarding hobit against this repository (blocking — the agent explores the
 * clone and writes an L3 narrative into the context pack). On success, invalidate the context
 * markdown so the new narrative surfaces.
 */
export function useRunOnboardingMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<HobitRunOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/hobits/{slug}/run",
        { params: { path: { repository_id: id, slug: "repo-onboarding" } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repositoryKeys.context(id) });
      queryClient.invalidateQueries({ queryKey: repositoryKeys.hobitRuns(id) });
    },
  });
}

/** The hobits assigned to this repository (its access allow-list). */
export function useRepoHobitsQuery(id: string) {
  return useQuery<HobitOut[]>({
    queryKey: repositoryKeys.hobits(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/hobits",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** Replace the hobits assigned to a repository (id in the variables — the wizard only knows it
 * after ingest). */
export function useSetRepoHobitsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      slugs,
    }: {
      id: string;
      slugs: string[];
    }): Promise<HobitOut[]> => {
      const { data, error } = await api.PUT(
        "/api/v1/repositories/{repository_id}/hobits",
        { params: { path: { repository_id: id } }, body: { slugs } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data, vars) => {
      queryClient.setQueryData(repositoryKeys.hobits(vars.id), data);
    },
  });
}

/** Run an assigned hobit against this repository (blocking). */
export function useRunRepoHobitMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (slug: string): Promise<HobitRunOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/hobits/{slug}/run",
        { params: { path: { repository_id: id, slug } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repositoryKeys.hobitRuns(id) });
      queryClient.invalidateQueries({ queryKey: ["hobits"] });
      queryClient.invalidateQueries({ queryKey: ["briefing"] });
    },
  });
}

/** Set how often an assigned hobit runs on this repo (manual | hourly | daily | weekly | cron:<expr>). */
export function useSetCadenceMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      slug,
      cadence,
    }: {
      slug: string;
      cadence: string;
    }): Promise<HobitOut[]> => {
      const { data, error } = await api.PUT(
        "/api/v1/repositories/{repository_id}/hobits/{slug}/cadence",
        { params: { path: { repository_id: id, slug } }, body: { cadence } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(repositoryKeys.hobits(id), data);
    },
  });
}

/**
 * Change-gated run of an assigned hobit: runs only if the repo moved since the last result,
 * otherwise records a skip — the same logic the scheduler applies. Blocking when it runs.
 */
export function useRefreshHobitMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (slug: string): Promise<HobitRunOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/hobits/{slug}/refresh",
        { params: { path: { repository_id: id, slug } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repositoryKeys.hobitRuns(id) });
      queryClient.invalidateQueries({ queryKey: repositoryKeys.hobits(id) });
      queryClient.invalidateQueries({ queryKey: ["hobits"] });
      queryClient.invalidateQueries({ queryKey: ["briefing"] });
    },
  });
}

/** Ingest a new repository by git URL (clone + analyze, blocking). */
export function useIngestRepositoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      url,
      connectionId,
      toolIds,
    }: {
      url: string;
      connectionId?: string | null;
      toolIds?: string[] | null;
    }): Promise<RepositoryOut> => {
      const { data, error } = await api.POST("/api/v1/repositories", {
        body: {
          url,
          connection_id: connectionId || null,
          tool_ids: toolIds ?? null,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repositoryKeys.all });
    },
  });
}

/** Pull the latest commits and re-run the full analysis (blocking). */
export function useRefreshRepositoryMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<RepositoryOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/refresh",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repositoryKeys.all });
    },
  });
}

/** Delete a repository and everything derived from it (analysis, artifacts, hobit runs, briefing
 * items, and the clone). A local repo's own files are left untouched. */
export function useDeleteRepositoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await api.DELETE(
        "/api/v1/repositories/{repository_id}",
        {
          params: { path: { repository_id: id } },
        },
      );
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: repositoryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: repositoryKeys.all });
      queryClient.invalidateQueries({ queryKey: ["hobits"] });
      queryClient.invalidateQueries({ queryKey: ["briefing"] });
    },
  });
}

/**
 * Codebase-graph (emerge) status for a repository: whether an artifact exists
 * and the URL to iframe. Cheap poll target; independent of the analysis query.
 */
export function useGraphQuery(id: string) {
  return useQuery<GraphOut>({
    queryKey: repositoryKeys.graph(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/graph",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** (Re)generate the codebase graph. Blocking — emerge can take a while on big repos. */
export function useGenerateGraphMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<GraphOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/graph/run",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(repositoryKeys.graph(id), data);
    },
  });
}

/** Code age (git-of-theseus) status: whether the SVG exists + its URL. */
export function useCodeAgeQuery(id: string) {
  return useQuery<CodeAgeOut>({
    queryKey: repositoryKeys.codeAge(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/code-age",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** (Re)generate the code-age chart. Blocking — walks full git history. */
export function useGenerateCodeAgeMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<CodeAgeOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/code-age/run",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) =>
      queryClient.setQueryData(repositoryKeys.codeAge(id), data),
  });
}

/** Temporal coupling (code-maat) status: ranked file pairs that change together. */
export function useCouplingQuery(id: string) {
  return useQuery<CouplingOut>({
    queryKey: repositoryKeys.coupling(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/coupling",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** (Re)compute temporal coupling. Blocking — mines full git history. */
export function useGenerateCouplingMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<CouplingOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/coupling/run",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) =>
      queryClient.setQueryData(repositoryKeys.coupling(id), data),
  });
}

/** Cached dependency-freshness (latest versions + upgrade gaps + AI gains). */
export function useDependencyFreshnessQuery(id: string) {
  return useQuery<DependencyFreshnessOut>({
    queryKey: repositoryKeys.dependencyFreshness(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/dependency-freshness",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** Fetch latest versions from PyPI, compute gaps, summarize gains (blocking). */
export function useGenerateDependencyFreshnessMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<DependencyFreshnessOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/dependency-freshness/run",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) =>
      queryClient.setQueryData(repositoryKeys.dependencyFreshness(id), data),
  });
}

/** Architecture-diagram catalog + any previously generated Mermaid diagrams. */
export function useArchitectureQuery(id: string) {
  return useQuery<ArchitectureOut>({
    queryKey: repositoryKeys.architecture(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/architecture",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** Generate one Mermaid diagram of the given kind (a hobit explores the clone; blocking). */
export function useGenerateArchitectureDiagramMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (kind: string): Promise<ArchitectureOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/architecture/{kind}/run",
        { params: { path: { repository_id: id, kind } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) =>
      queryClient.setQueryData(repositoryKeys.architecture(id), data),
  });
}

/** Cached big-picture codebase overview (what it is, why, key capabilities). */
export function useCodebaseOverviewQuery(id: string) {
  return useQuery<CodebaseOverviewOut>({
    queryKey: repositoryKeys.codebaseOverview(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/codebase-overview",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** Have a hobit investigate the clone and write a crisp big-picture overview (blocking). */
export function useGenerateCodebaseOverviewMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<CodebaseOverviewOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/codebase-overview/run",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) =>
      queryClient.setQueryData(repositoryKeys.codebaseOverview(id), data),
  });
}

/** Code-city map (CodeCharta) status: whether the map exists + the viewer URL. */
export function useCodeMapQuery(id: string) {
  return useQuery<CodeMapOut>({
    queryKey: repositoryKeys.codeMap(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/code-map",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** (Re)generate the CodeCharta code-city map. Blocking. */
export function useGenerateCodeMapMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<CodeMapOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/code-map/run",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) =>
      queryClient.setQueryData(repositoryKeys.codeMap(id), data),
  });
}

/**
 * A tool's raw findings log (lint/SAST/dead-code/secret locations) for its latest run.
 * Fetched on demand (kept out of the analysis payload); resolves to a null log when the tool
 * hasn't run or produced nothing.
 */
export function useToolLogQuery(id: string, tool: string) {
  return useQuery<ToolLogOut>({
    queryKey: repositoryKeys.toolLog(id, tool),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/tools/{tool}/log",
        { params: { path: { repository_id: id, tool } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** Tool-ids of the integrations linked to a repository (the analysis allow-list). */
export function useRepoIntegrationsQuery(id: string) {
  return useQuery<string[]>({
    queryKey: repositoryKeys.integrations(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/integrations",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** Link an integration to a repo (enables it; runs on next refresh / manual run). */
export function useLinkIntegrationMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tool: string): Promise<string[]> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/integrations/{tool_id}",
        { params: { path: { repository_id: id, tool_id: tool } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(repositoryKeys.integrations(id), data);
    },
  });
}

/** Unlink an integration and clear its contributed data from the analysis. */
export function useUnlinkIntegrationMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tool: string): Promise<string[]> => {
      const { data, error } = await api.DELETE(
        "/api/v1/repositories/{repository_id}/integrations/{tool_id}",
        { params: { path: { repository_id: id, tool_id: tool } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(repositoryKeys.integrations(id), data);
      // Unlink clears analysis data / viz artifacts — refetch everything under the repo.
      queryClient.invalidateQueries({ queryKey: repositoryKeys.detail(id) });
    },
  });
}

/** Run a single external tool against a repository. Returns fresh analysis. */
export function useRunToolMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tool: ToolName): Promise<AnalysisOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/tools/{tool}/run",
        { params: { path: { repository_id: id, tool } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(repositoryKeys.analysis(id), data);
      queryClient.invalidateQueries({ queryKey: repositoryKeys.detail(id) });
    },
  });
}
