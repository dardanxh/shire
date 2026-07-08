import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type AnalysisOut,
  api,
  type CodeAgeOut,
  type CodeMapOut,
  type ContextMarkdownOut,
  type CouplingOut,
  type GraphOut,
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

/** Ingest a new repository by git URL (clone + analyze, blocking). */
export function useIngestRepositoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      url,
      connectionId,
    }: {
      url: string;
      connectionId?: string | null;
    }): Promise<RepositoryOut> => {
      const { data, error } = await api.POST("/api/v1/repositories", {
        body: { url, connection_id: connectionId || null },
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
