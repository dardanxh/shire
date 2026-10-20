import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { components } from "@/lib/api-types.gen";
import { mcpKeys } from "./keys";

export type McpServer = components["schemas"]["McpServerResult"];
export type McpServers = components["schemas"]["McpServersResult"];
export type McpStatus = "connected" | "needs_auth" | "failed" | "unknown";

/**
 * The MCP servers the host runner's Claude CLI sees (latest probe). Polls fast
 * while a probe is queued/running so a Refresh lands without a reload.
 */
export function useMcpServersQuery() {
  return useQuery({
    queryKey: mcpKeys.servers(),
    queryFn: async (): Promise<McpServers> => {
      const { data, error } = await api.GET("/api/v1/mcp/servers");
      if (error) throw error;
      return data;
    },
    staleTime: 15_000,
    refetchInterval: (query) => {
      const status = query.state.data?.probe_status;
      return status === "pending" || status === "running" ? 3_000 : 60_000;
    },
  });
}

/** Queue a probe (deduplicated server-side). */
export function useRefreshMcpMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<McpServers> => {
      const { data, error } = await api.POST("/api/v1/mcp/refresh");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => queryClient.setQueryData(mcpKeys.servers(), data),
  });
}
