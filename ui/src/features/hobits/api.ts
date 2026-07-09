import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  api,
  type HobitConfigUpdate,
  type HobitOut,
  type HobitRunOut,
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

/** Run this hobit against a chosen repository (blocking). Refreshes runs + the briefing. */
export function useRunHobitMutation(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (repoId: string): Promise<HobitRunOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/hobits/{slug}/run",
        { params: { path: { repository_id: repoId, slug } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hobitKeys.runs(slug) });
      queryClient.invalidateQueries({ queryKey: ["briefing"] });
    },
  });
}
