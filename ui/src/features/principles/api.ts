import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  api,
  type PrincipleIn,
  type PrincipleOut,
  type RepoPrincipleStatusOut,
} from "@/lib/api";
import { principleKeys } from "./keys";

/** Every principle with its fleet standing (upheld/violated repo counts). */
export function usePrinciplesQuery() {
  return useQuery<PrincipleOut[]>({
    queryKey: principleKeys.lists(),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/principles");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreatePrincipleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: PrincipleIn): Promise<PrincipleOut> => {
      const { data, error } = await api.POST("/api/v1/principles", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: principleKeys.all });
    },
  });
}

export function useUpdatePrincipleMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: PrincipleIn): Promise<PrincipleOut> => {
      const { data, error } = await api.PUT(
        "/api/v1/principles/{principle_id}",
        {
          params: { path: { principle_id: id } },
          body,
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: principleKeys.all });
    },
  });
}

export function useDeletePrincipleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await api.DELETE("/api/v1/principles/{principle_id}", {
        params: { path: { principle_id: id } },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: principleKeys.all });
    },
  });
}

/**
 * Each applicable principle's newest verdict for one repository. Polls while any
 * audit is still in flight, then stops on its own.
 */
export function useRepoPrinciplesQuery(repositoryId: string) {
  return useQuery<RepoPrincipleStatusOut[]>({
    queryKey: principleKeys.repo(repositoryId),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/principles",
        { params: { path: { repository_id: repositoryId } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: repositoryId !== "",
    refetchInterval: (query) =>
      query.state.data?.some((s) => s.latest_check?.status === "pending")
        ? 2500
        : false,
  });
}

/** Audit the repository against every applicable enabled principle (one job each). */
export function useAuditRepositoryMutation(repositoryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<RepoPrincipleStatusOut[]> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/principles/audit",
        { params: { path: { repository_id: repositoryId } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(principleKeys.repo(repositoryId), data);
      queryClient.invalidateQueries({ queryKey: principleKeys.lists() });
    },
  });
}
