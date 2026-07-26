import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { components } from "@/lib/api-types.gen";
import { type ModellingListParams, modellingKeys } from "./keys";

export type ModellingStrategy =
  components["schemas"]["ModellingStrategyResult"];
export type CreateModellingStrategy =
  components["schemas"]["CreateModellingStrategy"];
export type UpdateModellingStrategy =
  components["schemas"]["UpdateModellingStrategy"];

/**
 * One tab's catalog in one fetch — 43 strategies across both topics against the
 * backend's page-size cap of 100, so a single page always suffices. Revisit with
 * the sequential-page loop from `useTechnologyCorpusQuery` before the corpus
 * nears 100 rows per topic.
 */
export function useModellingStrategiesQuery(params: ModellingListParams) {
  return useQuery({
    queryKey: modellingKeys.list(params),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/modelling-strategies", {
        params: { query: { ...params, page: 1, size: 100 } },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useModellingStrategyQuery(id: string) {
  return useQuery({
    queryKey: modellingKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/modelling-strategies/{strategy_id}",
        { params: { path: { strategy_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

export function useCreateModellingStrategyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateModellingStrategy) => {
      const { data, error } = await api.POST("/api/v1/modelling-strategies", {
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modellingKeys.all });
    },
  });
}

export function useUpdateModellingStrategyMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateModellingStrategy) => {
      const { data, error } = await api.PATCH(
        "/api/v1/modelling-strategies/{strategy_id}",
        { params: { path: { strategy_id: id } }, body },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modellingKeys.all });
    },
  });
}

export function useDeleteModellingStrategyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE(
        "/api/v1/modelling-strategies/{strategy_id}",
        { params: { path: { strategy_id: id } } },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modellingKeys.all });
    },
  });
}
