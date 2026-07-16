import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type ToolStatusOut } from "@/lib/api";
import { toolKeys } from "./keys";

/**
 * The persisted tools catalog (availability + versions). Read from Postgres on the backend, so this
 * is a cheap query — kept fresh in-cache for 5 minutes; refresh the environment probe via sync.
 */
export function useToolsQuery() {
  return useQuery({
    queryKey: toolKeys.list(),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/tools");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
    // Poll fast only while a background install is running, so the availability
    // badge flips on its own; otherwise the 5-minute cache stands.
    refetchInterval: (query) =>
      query.state.data?.some((tool) => tool.install_status === "running")
        ? 3_000
        : false,
  });
}

/** Kick off a tool's curated background install (202; the list poll tracks it). */
export function useInstallToolMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (toolId: string): Promise<ToolStatusOut> => {
      const { data, error } = await api.POST(
        "/api/v1/tools/{tool_id}/install",
        {
          params: { path: { tool_id: toolId } },
        },
      );
      if (error) throw error;
      return data;
    },
    // Invalidating restarts the list query's install-aware poll.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: toolKeys.all }),
  });
}

/** Re-probe the local environment for every tool and refresh the stored catalog. */
export function useSyncToolsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ToolStatusOut[]> => {
      const { data, error } = await api.POST("/api/v1/tools/sync");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(toolKeys.list(), data);
    },
  });
}
