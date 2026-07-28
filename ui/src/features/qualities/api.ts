import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { components } from "@/lib/api-types.gen";
import { type QualityListParams, qualityKeys } from "./keys";

export type ArchitectureQuality =
  components["schemas"]["ArchitectureQualityResult"];
export type UpdateArchitectureQuality =
  components["schemas"]["UpdateArchitectureQuality"];
export type QualityMechanism = components["schemas"]["QualityMechanism"];
export type QualityManifestation =
  components["schemas"]["QualityManifestation"];
export type QualityTradeoff = components["schemas"]["QualityTradeoff"];

/**
 * The whole catalog in one fetch — 19 qualities against the backend's page-size
 * cap of 100, so a single page always suffices.
 */
export function useArchitectureQualitiesQuery(params: QualityListParams = {}) {
  return useQuery({
    queryKey: qualityKeys.list(params),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/architecture-qualities", {
        params: { query: { ...params, page: 1, size: 100 } },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useArchitectureQualityQuery(id: string) {
  return useQuery({
    queryKey: qualityKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/architecture-qualities/{quality_id}",
        { params: { path: { quality_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** Star-only curation — quality content stays seed-managed. */
export function useUpdateArchitectureQualityMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateArchitectureQuality) => {
      const { data, error } = await api.PATCH(
        "/api/v1/architecture-qualities/{quality_id}",
        { params: { path: { quality_id: id } }, body },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qualityKeys.all });
    },
  });
}
