import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { briefingKeys } from "./keys";

/** The briefing feed, newest first. Optionally filtered to one hobit. */
export function useBriefingQuery(hobitSlug?: string) {
  return useQuery({
    queryKey: briefingKeys.feed(hobitSlug),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/briefing", {
        params: { query: hobitSlug ? { hobit_slug: hobitSlug } : {} },
      });
      if (error) throw error;
      return data;
    },
  });
}

/** The full hobit run behind a post (narrative + scores), for the detail dialog. */
export function useRunDetailQuery(repoId: string, runId: string) {
  return useQuery({
    queryKey: briefingKeys.runDetail(repoId, runId),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/hobits/runs/{run_id}",
        { params: { path: { repository_id: repoId, run_id: runId } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: repoId !== "" && runId !== "",
  });
}

/** Rate a run's response 1-5 stars with an optional comment (one per run; PUT replaces it). */
export function useUpsertRunFeedbackMutation(repoId: string, runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { rating: number; comment?: string | null }) => {
      const { data, error } = await api.PUT(
        "/api/v1/repositories/{repository_id}/hobits/runs/{run_id}/feedback",
        { params: { path: { repository_id: repoId, run_id: runId } }, body },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: briefingKeys.runDetail(repoId, runId),
      });
      queryClient.invalidateQueries({ queryKey: ["hobits"] });
    },
  });
}

/** Remove the rating from a run's response. */
export function useDeleteRunFeedbackMutation(repoId: string, runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await api.DELETE(
        "/api/v1/repositories/{repository_id}/hobits/runs/{run_id}/feedback",
        { params: { path: { repository_id: repoId, run_id: runId } } },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: briefingKeys.runDetail(repoId, runId),
      });
      queryClient.invalidateQueries({ queryKey: ["hobits"] });
    },
  });
}

/** Mark one post read (fired when a post is opened). Refreshes feeds + hobit unread counts. */
export function useMarkPostReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await api.POST("/api/v1/briefing/{item_id}/read", {
        params: { path: { item_id: itemId } },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: briefingKeys.all });
      queryClient.invalidateQueries({ queryKey: ["hobits"] });
    },
  });
}

/** Mark all of a hobit's posts read (fired when its timeline is opened). */
export function useMarkHobitPostsReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (hobitSlug: string) => {
      const { error } = await api.POST("/api/v1/briefing/read", {
        body: { hobit_slug: hobitSlug },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: briefingKeys.all });
      queryClient.invalidateQueries({ queryKey: ["hobits"] });
    },
  });
}
