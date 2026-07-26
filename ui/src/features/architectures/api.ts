import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { components } from "@/lib/api-types.gen";
import { type BlueprintListParams, blueprintKeys } from "./keys";

export type Blueprint = components["schemas"]["BlueprintResult"];
export type BlueprintStage = components["schemas"]["BlueprintStageResult"];
export type CreateBlueprint = components["schemas"]["CreateBlueprint"];
export type UpdateBlueprint = components["schemas"]["UpdateBlueprint"];

export function useBlueprintsQuery(params: BlueprintListParams) {
  return useQuery({
    queryKey: blueprintKeys.list(params),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/blueprints", {
        params: { query: params },
      });
      if (error) throw error;
      return data;
    },
    // Keep the previous results on screen while a filter change loads.
    placeholderData: keepPreviousData,
  });
}

/** Unfiltered counts per source — drives the tab labels and the "N of TOTAL" counter. */
export function useBlueprintCountsQuery() {
  return useQuery({
    queryKey: [...blueprintKeys.all, "counts"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/blueprints", {
        params: { query: {} },
      });
      if (error) throw error;
      return {
        seed: data.filter((b) => b.source === "seed").length,
        user: data.filter((b) => b.source === "user").length,
      };
    },
  });
}

/** Shared detail options — also used by route loaders to warm the cache. */
export function blueprintQueryOptions(id: string) {
  return queryOptions({
    queryKey: blueprintKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/blueprints/{blueprint_id}",
        { params: { path: { blueprint_id: id } } },
      );
      if (error) throw error;
      return data;
    },
  });
}

export function useBlueprintQuery(id: string) {
  return useQuery({ ...blueprintQueryOptions(id), enabled: id !== "" });
}

export function useCreateBlueprintMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateBlueprint) => {
      const { data, error } = await api.POST("/api/v1/blueprints", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blueprintKeys.all });
    },
  });
}

/** Clone a blueprint into a new editable user architecture. */
export function useCloneBlueprintMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name?: string }) => {
      const { data, error } = await api.POST(
        "/api/v1/blueprints/{blueprint_id}/clone",
        {
          params: { path: { blueprint_id: id } },
          body: { name: name ?? null },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blueprintKeys.all });
    },
  });
}

export function useUpdateBlueprintMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateBlueprint) => {
      const { data, error } = await api.PATCH(
        "/api/v1/blueprints/{blueprint_id}",
        { params: { path: { blueprint_id: id } }, body },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blueprintKeys.all });
    },
  });
}

export function useDeleteBlueprintMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/api/v1/blueprints/{blueprint_id}", {
        params: { path: { blueprint_id: id } },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blueprintKeys.all });
    },
  });
}
