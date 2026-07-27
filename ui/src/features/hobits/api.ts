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

/** The repositories this hobit is assigned to, each with its run schedule. */
export function useHobitAssignmentsQuery(slug: string) {
  return useQuery({
    queryKey: hobitKeys.assignments(slug),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/hobits/{slug}/assignments",
        { params: { path: { slug } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: slug !== "",
  });
}

/** The hobit's standing guidance distilled from run feedback (empty until distilled). */
export function useHobitGuidanceQuery(slug: string) {
  return useQuery({
    queryKey: hobitKeys.guidance(slug),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/hobits/{slug}/guidance", {
        params: { path: { slug } },
      });
      if (error) throw error;
      return data;
    },
    enabled: slug !== "",
    // A distillation lands asynchronously (engine job) — poll while one is in flight.
    refetchInterval: (query) =>
      query.state.data?.distill_pending ? 5000 : false,
  });
}

/** Force a feedback-distillation job now (async — the guidance refreshes when it lands). */
export function useDistillGuidanceMutation(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST(
        "/api/v1/hobits/{slug}/guidance/distill",
        { params: { path: { slug } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(hobitKeys.guidance(slug), data);
    },
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

/** Save several hobits' configs in one go (sequential PUTs, one invalidation). */
export function useBulkUpdateHobitsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      updates: Array<{ slug: string; body: HobitConfigUpdate }>,
    ): Promise<void> => {
      for (const { slug, body } of updates) {
        const { error } = await api.PUT("/api/v1/hobits/{slug}", {
          params: { path: { slug } },
          body,
        });
        if (error) throw error;
      }
    },
    // onSettled, not onSuccess: a mid-loop failure still leaves earlier
    // hobits updated, and the list should reflect them.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: hobitKeys.all });
    },
  });
}

/** Delete several custom hobits in one go (sequential DELETEs, one invalidation). */
export function useBulkDeleteHobitsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (slugs: string[]): Promise<void> => {
      for (const slug of slugs) {
        const { error } = await api.DELETE("/api/v1/hobits/{slug}", {
          params: { path: { slug } },
        });
        if (error) throw error;
      }
    },
    onSettled: (_data, _error, slugs) => {
      for (const slug of slugs) {
        queryClient.removeQueries({ queryKey: hobitKeys.detail(slug) });
      }
      queryClient.invalidateQueries({ queryKey: hobitKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ["briefing"] });
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
