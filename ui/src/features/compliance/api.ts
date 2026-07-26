import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { components } from "@/lib/api-types.gen";
import { type ComplianceListParams, complianceKeys } from "./keys";

export type ComplianceCheckOut = components["schemas"]["ComplianceCheckResult"];
export type ComplianceFindingOut = components["schemas"]["ComplianceFinding"];

/** How often the list polls while any check on the page is still queued. */
const POLL_MS = 4000;

/** Checks list (server-paginated). Polls while runs are in flight, then stops. */
export function useComplianceChecksQuery(params: ComplianceListParams) {
  return useQuery({
    queryKey: complianceKeys.list(params),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/compliance-checks", {
        params: { query: params },
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: (query) =>
      query.state.data?.items?.some((check) => check.status === "queued")
        ? POLL_MS
        : false,
  });
}

/** Fan out one check per (repository, regulation) pair. Returns the queued checks. */
export function useRunComplianceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      repository_ids: string[];
      regulation_ids: string[];
    }): Promise<ComplianceCheckOut[]> => {
      const { data, error } = await api.POST("/api/v1/compliance-checks/run", {
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: complianceKeys.all });
    },
  });
}

export function useDeleteComplianceCheckMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE(
        "/api/v1/compliance-checks/{check_id}",
        { params: { path: { check_id: id } } },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: complianceKeys.all });
    },
  });
}
