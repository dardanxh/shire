import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { components } from "@/lib/api-types.gen";
import { env } from "@/lib/env";
import { aiActionKeys } from "./keys";

export type AiAction = components["schemas"]["AiActionResult"];
export type AiActionStatus = AiAction["status"];
export type AiActionRunner = components["schemas"]["AiActionRunnerResult"];
export type AiActionIn = components["schemas"]["CreateAiAction"];

/** Queued or running — the card polls while any action is in this state. */
export function isInFlight(action: Pick<AiAction, "status">): boolean {
  return action.status === "pending" || action.status === "running";
}

// Poll fast while something is in flight, otherwise just keep "next run" fresh.
const IN_FLIGHT_POLL_MS = 4_000;
const IDLE_POLL_MS = 60_000;

/**
 * The latest report as a standalone page on the API origin. The backend serves it with a
 * `sandbox` CSP; `v` busts the browser cache whenever a newer report lands.
 */
export function reportUrl(
  action: Pick<AiAction, "id" | "last_report_at">,
  { download = false }: { download?: boolean } = {},
): string {
  const params = new URLSearchParams({ v: action.last_report_at ?? "" });
  if (download) params.set("download", "true");
  return `${env.VITE_API_BASE_URL}/api/v1/ai-actions/${action.id}/report?${params}`;
}

export function useAiActionsQuery() {
  return useQuery({
    queryKey: aiActionKeys.list(),
    queryFn: async (): Promise<AiAction[]> => {
      const { data, error } = await api.GET("/api/v1/ai-actions");
      if (error) throw error;
      return data;
    },
    refetchInterval: (query) =>
      query.state.data?.some(isInFlight) ? IN_FLIGHT_POLL_MS : IDLE_POLL_MS,
  });
}

export function useAiActionQuery(id: string) {
  return useQuery({
    queryKey: aiActionKeys.detail(id),
    queryFn: async (): Promise<AiAction> => {
      const { data, error } = await api.GET("/api/v1/ai-actions/{action_id}", {
        params: { path: { action_id: id } },
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: (query) =>
      query.state.data && isInFlight(query.state.data)
        ? IN_FLIGHT_POLL_MS
        : IDLE_POLL_MS,
  });
}

export function useAiActionsRunnerQuery() {
  return useQuery({
    queryKey: aiActionKeys.runner(),
    queryFn: async (): Promise<AiActionRunner> => {
      const { data, error } = await api.GET("/api/v1/ai-actions/runner");
      if (error) throw error;
      return data;
    },
    refetchInterval: 15_000,
  });
}

function useInvalidateAiActions() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: aiActionKeys.all });
}

export function useCreateAiActionMutation() {
  const invalidate = useInvalidateAiActions();
  return useMutation({
    mutationFn: async (body: AiActionIn): Promise<AiAction> => {
      const { data, error } = await api.POST("/api/v1/ai-actions", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateAiActionMutation(id: string) {
  const invalidate = useInvalidateAiActions();
  return useMutation({
    mutationFn: async (body: AiActionIn): Promise<AiAction> => {
      const { data, error } = await api.PUT("/api/v1/ai-actions/{action_id}", {
        params: { path: { action_id: id } },
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteAiActionMutation() {
  const invalidate = useInvalidateAiActions();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await api.DELETE("/api/v1/ai-actions/{action_id}", {
        params: { path: { action_id: id } },
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useRunAiActionMutation() {
  const invalidate = useInvalidateAiActions();
  return useMutation({
    mutationFn: async ({
      id,
      arguments: args = "",
    }: {
      id: string;
      /** Appended to the prompt for this run only, e.g. `14` for `/dx-github-prs 14`. */
      arguments?: string;
    }): Promise<AiAction> => {
      const { data, error } = await api.POST(
        "/api/v1/ai-actions/{action_id}/run",
        {
          params: { path: { action_id: id } },
          body: { arguments: args },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useCancelAiActionMutation() {
  const invalidate = useInvalidateAiActions();
  return useMutation({
    mutationFn: async (id: string): Promise<AiAction> => {
      const { data, error } = await api.POST(
        "/api/v1/ai-actions/{action_id}/cancel",
        { params: { path: { action_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}
