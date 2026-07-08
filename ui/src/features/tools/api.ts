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
