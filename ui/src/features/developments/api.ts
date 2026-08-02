import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { repositoryKeys } from "@/features/repositories/keys";
import type { RepositoryOut, WatchlistEntryOut, WatchlistOut } from "@/lib/api";
import { api } from "@/lib/api";
import { watchlistKeys } from "./keys";

const REFRESHING = new Set(["cloning", "analyzing"]);

/** The daily digest. Polls while any watched repo is pulling/re-analyzing. */
export function useWatchlistQuery() {
  return useQuery<WatchlistOut>({
    queryKey: watchlistKeys.digest(),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/watchlist");
      if (error) throw error;
      return data;
    },
    refetchInterval: (query) =>
      (query.state.data?.entries ?? []).some(
        (e) => REFRESHING.has(e.repository.status) || e.summary_pending,
      )
        ? 4000
        : false,
  });
}

/** Add/remove a repository from the watchlist. */
export function useSetWatchedMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      watched,
    }: {
      id: string;
      watched: boolean;
    }): Promise<RepositoryOut> => {
      const { data, error } = await api.PUT(
        "/api/v1/watchlist/{repository_id}",
        {
          params: { path: { repository_id: id } },
          body: { watched },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
      queryClient.invalidateQueries({ queryKey: repositoryKeys.all });
    },
  });
}

/** Pull latest for every idle watched repo (non-blocking; the digest polls status). */
export function useRefreshWatchlistMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<string[]> => {
      const { data, error } = await api.POST("/api/v1/watchlist/refresh");
      if (error) throw error;
      return data.queued_repository_ids;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
    },
  });
}

/** Advance the review cursor to the latest snapshot — its commits are now "seen". */
export function useMarkReviewedMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<WatchlistEntryOut> => {
      const { data, error } = await api.POST(
        "/api/v1/watchlist/{repository_id}/reviewed",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
    },
  });
}
