import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  api,
  type HobitConfigUpdate,
  type HobitInput,
  type HobitOut,
} from "@/lib/api";
import { hobitKeys } from "./keys";

/** All registered hobits, merged with their effective config + last run. */
export function useHobitsQuery() {
  return useQuery({
    queryKey: hobitKeys.lists(),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/hobits");
      if (error) throw error;
      return data;
    },
  });
}

/** One hobit (registry identity + effective config). Disabled while `slug` is empty. */
export function useHobitQuery(slug: string) {
  return useQuery({
    queryKey: hobitKeys.detail(slug),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/hobits/{slug}", {
        params: { path: { slug } },
      });
      if (error) throw error;
      return data;
    },
    enabled: slug !== "",
  });
}

/** This hobit's runs across every repository, newest first. */
export function useHobitRunsQuery(slug: string) {
  return useQuery({
    queryKey: hobitKeys.runs(slug),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/hobits/{slug}/runs", {
        params: { path: { slug } },
      });
      if (error) throw error;
      return data;
    },
    enabled: slug !== "",
  });
}

/** Save a hobit's config (model, charter, timeout, enabled) as overrides. */
export function useUpdateHobitMutation(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: HobitConfigUpdate): Promise<HobitOut> => {
      const { data, error } = await api.PUT("/api/v1/hobits/{slug}", {
        params: { path: { slug } },
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(hobitKeys.detail(slug), data);
      queryClient.invalidateQueries({ queryKey: hobitKeys.lists() });
    },
  });
}

/** Create a user-authored (custom) hobit. */
export function useCreateHobitMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: HobitInput): Promise<HobitOut> => {
      const { data, error } = await api.POST("/api/v1/hobits", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hobitKeys.lists() });
    },
  });
}

/** Fully edit a custom hobit (identity + config). */
export function useUpdateHobitDefinitionMutation(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: HobitInput): Promise<HobitOut> => {
      const { data, error } = await api.PUT(
        "/api/v1/hobits/{slug}/definition",
        {
          params: { path: { slug } },
          body,
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(hobitKeys.detail(slug), data);
      queryClient.invalidateQueries({ queryKey: hobitKeys.lists() });
    },
  });
}

/** Delete a custom hobit and everything tied to it. */
export function useDeleteHobitMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (slug: string): Promise<void> => {
      const { error } = await api.DELETE("/api/v1/hobits/{slug}", {
        params: { path: { slug } },
      });
      if (error) throw error;
    },
    onSuccess: (_data, slug) => {
      queryClient.removeQueries({ queryKey: hobitKeys.detail(slug) });
      queryClient.invalidateQueries({ queryKey: hobitKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ["briefing"] });
    },
  });
}
