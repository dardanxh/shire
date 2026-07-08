import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type AnalysisOut,
  api,
  type CodeAgeOut,
  type CodeMapOut,
  type CouplingOut,
  type GraphOut,
  type RepositoryOut,
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
