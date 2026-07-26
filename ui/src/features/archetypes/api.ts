import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { components } from "@/lib/api-types.gen";
import { type ArchetypeListParams, archetypeKeys } from "./keys";

export type Archetype = components["schemas"]["ArchetypeResult"];
export type CreateArchetype = components["schemas"]["CreateArchetype"];
export type UpdateArchetype = components["schemas"]["UpdateArchetype"];

export function useArchetypesQuery(params: ArchetypeListParams) {
  return useQuery({
    queryKey: archetypeKeys.list(params),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/archetypes", {
        params: { query: params },
      });
      if (error) throw error;
      return data;
    },
    // Keep the previous page on screen while the next one loads.
    placeholderData: keepPreviousData,
  });
}

export function useArchetypeQuery(id: string) {
  return useQuery({
    queryKey: archetypeKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/archetypes/{archetype_id}",
        { params: { path: { archetype_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

export function useCreateArchetypeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateArchetype) => {
      const { data, error } = await api.POST("/api/v1/archetypes", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: archetypeKeys.all });
    },
  });
}

export function useUpdateArchetypeMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateArchetype) => {
      const { data, error } = await api.PATCH(
        "/api/v1/archetypes/{archetype_id}",
        { params: { path: { archetype_id: id } }, body },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: archetypeKeys.all });
    },
  });
}

/** Quick archive/unarchive from list rows — takes the id per call (no per-row hooks). */
export function useSetArchetypeArchivedMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { data, error } = await api.PATCH(
        "/api/v1/archetypes/{archetype_id}",
        { params: { path: { archetype_id: id } }, body: { archived } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: archetypeKeys.all });
    },
  });
}

export function useDeleteArchetypeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/api/v1/archetypes/{archetype_id}", {
        params: { path: { archetype_id: id } },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: archetypeKeys.all });
    },
  });
}
