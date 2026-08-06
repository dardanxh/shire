import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  api,
  type HighlightIn,
  type HighlightOut,
  type HighlightsPage,
} from "@/lib/api";
import { type HighlightListParams, highlightKeys } from "./keys";

/** Kept passages, newest first (server-paginated `Page` envelope). */
export function useHighlightsQuery(params: HighlightListParams) {
  return useQuery<HighlightsPage>({
    queryKey: highlightKeys.list(params),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/highlights", {
        params: { query: params },
      });
      if (error) throw error;
      return data;
    },
  });
}

/** Keep the selected passage, with where it was read. */
export function useCreateHighlightMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: HighlightIn): Promise<HighlightOut> => {
      const { data, error } = await api.POST("/api/v1/highlights", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: highlightKeys.all });
    },
  });
}

export function useDeleteHighlightMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await api.DELETE("/api/v1/highlights/{highlight_id}", {
        params: { path: { highlight_id: id } },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: highlightKeys.all });
    },
  });
}
