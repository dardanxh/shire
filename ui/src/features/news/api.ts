import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  api,
  type NewsConfigOut,
  type NewsItemsPage,
  type NewsPollOut,
  type NewsRecommendationOut,
  type NewsSourceIn,
  type NewsSourceOut,
  type NewsTopicIn,
  type NewsTopicOut,
  type UpdateNewsConfigIn,
} from "@/lib/api";
import { type NewsItemsParams, newsKeys } from "./keys";

/** How often news queries poll while any poll run is still pending. */
const POLL_MS = 5000;

/** True while any run on the list is still waiting on the engine. */
export function hasPendingPoll(polls: Pick<NewsPollOut, "status">[]): boolean {
  return polls.some((p) => p.status === "pending");
}

/** The feed page. Re-fetched by the polls query's invalidation when a run settles. */
export function useNewsItemsQuery(params: NewsItemsParams) {
  return useQuery({
    queryKey: newsKeys.itemsPage(params),
    queryFn: async (): Promise<NewsItemsPage> => {
      const { data, error } = await api.GET("/api/v1/news/items", {
        params: { query: params },
      });
      if (error) throw error;
      return data;
    },
  });
}

/** Topics with sources, newest poll state and unread counts (Topics tab + feed filter). */
export function useNewsTopicsQuery() {
  return useQuery({
    queryKey: newsKeys.topics(),
    queryFn: async (): Promise<NewsTopicOut[]> => {
      const { data, error } = await api.GET("/api/v1/news/topics");
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Recent poll runs. Polls while any run is pending, and on each settle-tick
 * invalidates the rest of the news tree so new articles stream into the feed.
 */
export function useNewsPollsQuery() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: newsKeys.polls(),
    queryFn: async (): Promise<NewsPollOut[]> => {
      const { data, error } = await api.GET("/api/v1/news/polls");
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: newsKeys.items() });
      queryClient.invalidateQueries({ queryKey: newsKeys.topics() });
      return data;
    },
    refetchInterval: (query) => {
      const polls = query.state.data;
      if (!polls) return false;
      return hasPendingPoll(polls) ? POLL_MS : false;
    },
  });
}

export function useNewsConfigQuery() {
  return useQuery({
    queryKey: newsKeys.config(),
    queryFn: async (): Promise<NewsConfigOut> => {
      const { data, error } = await api.GET("/api/v1/news/config");
      if (error) throw error;
      return data;
    },
  });
}

export function useNewsRecommendationsQuery(pollWhilePending: boolean) {
  return useQuery({
    queryKey: newsKeys.recommendations(),
    queryFn: async (): Promise<NewsRecommendationOut[]> => {
      const { data, error } = await api.GET("/api/v1/news/recommendations");
      if (error) throw error;
      return data;
    },
    // While a generation job is in flight the caller flips this on so fresh
    // suggestions appear as soon as the handler settles them.
    refetchInterval: pollWhilePending ? POLL_MS : false,
  });
}

// ---- mutations ---------------------------------------------------------------

export function useCreateTopicMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: NewsTopicIn): Promise<NewsTopicOut> => {
      const { data, error } = await api.POST("/api/v1/news/topics", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: newsKeys.all }),
  });
}

export function useUpdateTopicMutation(topicId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: NewsTopicIn): Promise<NewsTopicOut> => {
      const { data, error } = await api.PUT("/api/v1/news/topics/{topic_id}", {
        params: { path: { topic_id: topicId } },
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: newsKeys.all }),
  });
}

export function useDeleteTopicMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (topicId: string): Promise<void> => {
      const { error } = await api.DELETE("/api/v1/news/topics/{topic_id}", {
        params: { path: { topic_id: topicId } },
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: newsKeys.all }),
  });
}

export function useAddSourceMutation(topicId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: NewsSourceIn): Promise<NewsSourceOut> => {
      const { data, error } = await api.POST(
        "/api/v1/news/topics/{topic_id}/sources",
        { params: { path: { topic_id: topicId } }, body },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: newsKeys.topics() }),
  });
}

export function useDeleteSourceMutation(topicId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sourceId: string): Promise<void> => {
      const { error } = await api.DELETE(
        "/api/v1/news/topics/{topic_id}/sources/{source_id}",
        { params: { path: { topic_id: topicId, source_id: sourceId } } },
      );
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: newsKeys.topics() }),
  });
}

/** Fetch now — all enabled topics, or one when `topicId` is passed to `mutate`. */
export function useFetchNowMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (topicId?: string): Promise<NewsPollOut[]> => {
      if (topicId) {
        const { data, error } = await api.POST(
          "/api/v1/news/topics/{topic_id}/fetch",
          { params: { path: { topic_id: topicId } } },
        );
        if (error) throw error;
        return [data];
      }
      const { data, error } = await api.POST("/api/v1/news/fetch");
      if (error) throw error;
      return data;
    },
    // Invalidating the whole tree restarts the polls query's interval.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: newsKeys.all }),
  });
}

export function useMarkItemReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string): Promise<void> => {
      const { error } = await api.POST("/api/v1/news/items/{item_id}/read", {
        params: { path: { item_id: itemId } },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: newsKeys.items() });
      queryClient.invalidateQueries({ queryKey: newsKeys.topics() });
    },
  });
}

export function useMarkAllReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (topicId?: string): Promise<void> => {
      const { error } = await api.POST("/api/v1/news/read", {
        body: { topic_id: topicId ?? null },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: newsKeys.items() });
      queryClient.invalidateQueries({ queryKey: newsKeys.topics() });
    },
  });
}

export function useUpdateNewsConfigMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateNewsConfigIn): Promise<NewsConfigOut> => {
      const { data, error } = await api.PUT("/api/v1/news/config", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => queryClient.setQueryData(newsKeys.config(), data),
  });
}

export function useGenerateRecommendationsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ job_id: string }> => {
      const { data, error } = await api.POST(
        "/api/v1/news/recommendations/generate",
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: newsKeys.recommendations() }),
  });
}

export function useAcceptRecommendationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (recommendationId: string): Promise<NewsTopicOut> => {
      const { data, error } = await api.POST(
        "/api/v1/news/recommendations/{recommendation_id}/accept",
        { params: { path: { recommendation_id: recommendationId } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: newsKeys.all }),
  });
}

export function useDismissRecommendationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (recommendationId: string): Promise<void> => {
      const { error } = await api.POST(
        "/api/v1/news/recommendations/{recommendation_id}/dismiss",
        { params: { path: { recommendation_id: recommendationId } } },
      );
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: newsKeys.recommendations() }),
  });
}
