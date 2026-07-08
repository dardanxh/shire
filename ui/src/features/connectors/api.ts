import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type ConnectionOut, type TestConnectionOut } from "@/lib/api";
import { type ConnectionListParams, connectionKeys } from "./keys";

/** The API request body for creating/testing a connection (snake_case). */
export interface ConnectionInput {
  name?: string;
  provider: "github" | "gitlab" | "bitbucket";
  auth_method: "token" | "basic";
  username?: string | null;
  secret?: string | null;
  base_url?: string | null;
}

/** List connections (server-paginated: returns the `Page` envelope). */
export function useConnectionsQuery(params: ConnectionListParams) {
  return useQuery({
    queryKey: connectionKeys.list(params),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/connections", {
        params: { query: params },
      });
      if (error) throw error;
      return data;
    },
  });
}

/** A single connection by id. Disabled while `id` is empty. */
export function useConnectionQuery(id: string) {
  return useQuery({
    queryKey: connectionKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/connections/{connection_id}",
        { params: { path: { connection_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** Create a connection. */
export function useCreateConnectionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ConnectionInput): Promise<ConnectionOut> => {
      const { data, error } = await api.POST("/api/v1/connections", {
        // `name` is required by the API for create; the form always supplies it.
        body: input as Required<Pick<ConnectionInput, "name">> &
          ConnectionInput,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: connectionKeys.all });
    },
  });
}

/** Update a connection. A blank `secret` keeps the stored one (handled by the caller). */
export function useUpdateConnectionMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      username?: string | null;
      secret?: string | null;
      base_url?: string | null;
    }): Promise<ConnectionOut> => {
      const { data, error } = await api.PATCH(
        "/api/v1/connections/{connection_id}",
        { params: { path: { connection_id: id } }, body: input },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: connectionKeys.all });
    },
  });
}

/** Delete a connection. */
export function useDeleteConnectionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await api.DELETE(
        "/api/v1/connections/{connection_id}",
        { params: { path: { connection_id: id } } },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: connectionKeys.all });
    },
  });
}

/** Test unsaved credentials (from the form). Returns `{ ok, message, account }`. */
export function useTestConnectionMutation() {
  return useMutation({
    mutationFn: async (input: ConnectionInput): Promise<TestConnectionOut> => {
      const { data, error } = await api.POST("/api/v1/connections/test", {
        body: input,
      });
      if (error) throw error;
      return data;
    },
  });
}

/** Test a saved connection's stored credentials. */
export function useTestConnectionByIdMutation() {
  return useMutation({
    mutationFn: async (id: string): Promise<TestConnectionOut> => {
      const { data, error } = await api.POST(
        "/api/v1/connections/{connection_id}/test",
        { params: { path: { connection_id: id } } },
      );
      if (error) throw error;
      return data;
    },
  });
}
