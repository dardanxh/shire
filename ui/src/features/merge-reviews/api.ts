import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  api,
  type CreateMrRemarkInput,
  type MergeReviewDetailOut,
} from "@/lib/api";
import { type MergeReviewListParams, mergeReviewKeys } from "./keys";

/** How often the detail query polls while the background analysis is still running. */
const POLL_MS = 2500;

/** Hobit-review statuses that mean "no longer being worked on". */
const SETTLED_REVIEW = new Set([
  "completed",
  "parse_failed",
  "agent_unavailable",
  "timeout",
  "error",
]);

/**
 * True once every AI section, every hobit review, and every requested principle check has
 * reached a terminal state.
 *
 * Principle checks are counted even though the pipeline never enqueues them: they are started
 * long after the analysis settles, and without them here the page would stop polling and the
 * verdicts would never appear.
 */
export function isReviewSettled(review: MergeReviewDetailOut): boolean {
  const principlesSettled = review.principle_checks.every(
    (c) => c.status !== "pending",
  );
  if (review.overall_status === "failed") return principlesSettled;
  const sections = [
    review.classification_status,
    review.overview_status,
    review.hobits_status,
    review.risk_status,
  ];
  return (
    principlesSettled &&
    review.overall_status === "completed" &&
    sections.every((s) => s === "completed" || s === "failed") &&
    review.hobit_reviews.every((r) => SETTLED_REVIEW.has(r.status))
  );
}

/** List merge reviews (server-paginated), optionally scoped to one repository. */
export function useMergeReviewsQuery(params: MergeReviewListParams) {
  return useQuery({
    queryKey: mergeReviewKeys.list(params),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/merge-reviews", {
        params: { query: params },
      });
      if (error) throw error;
      return data;
    },
  });
}

/**
 * One review. Polls while any AI section is still pending/running so the page
 * fills sections in as the background analysis lands, then stops on its own.
 */
export function useMergeReviewQuery(id: string) {
  return useQuery({
    queryKey: mergeReviewKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/merge-reviews/{review_id}",
        { params: { path: { review_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
    refetchInterval: (query) => {
      const review = query.state.data;
      if (!review) return false; // first fetch is in flight
      return isReviewSettled(review) ? false : POLL_MS;
    },
  });
}

export interface CreateMergeReviewInput {
  repository_id: string;
  source_branch: string;
  target_branch: string;
  title?: string | null;
  hobit_slugs: string[];
}

export function useCreateMergeReviewMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      body: CreateMergeReviewInput,
    ): Promise<MergeReviewDetailOut> => {
      const { data, error } = await api.POST("/api/v1/merge-reviews", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Seed the detail cache so the detail page paints the footprint instantly;
      // the polling refetchInterval takes over for the pending AI sections.
      queryClient.setQueryData(mergeReviewKeys.detail(data.id), data);
      queryClient.invalidateQueries({ queryKey: mergeReviewKeys.lists() });
    },
  });
}

export function useReanalyzeMergeReviewMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<MergeReviewDetailOut> => {
      const { data, error } = await api.POST(
        "/api/v1/merge-reviews/{review_id}/reanalyze",
        { params: { path: { review_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Statuses come back reset to pending → the detail query's reactive
      // refetchInterval immediately resumes polling. No manual timer needed.
      queryClient.setQueryData(mergeReviewKeys.detail(id), data);
      queryClient.invalidateQueries({ queryKey: mergeReviewKeys.lists() });
    },
  });
}

export function useDeleteMergeReviewMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await api.DELETE("/api/v1/merge-reviews/{review_id}", {
        params: { path: { review_id: id } },
      });
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: mergeReviewKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: mergeReviewKeys.lists() });
    },
  });
}

/**
 * Re-run one hobit's review of this MR. Returns the review with that card back at
 * `running`, so seeding the cache makes the detail query resume polling by itself.
 */
export function useRerunHobitReviewMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (hobitSlug: string): Promise<MergeReviewDetailOut> => {
      const { data, error } = await api.POST(
        "/api/v1/merge-reviews/{review_id}/hobit-reviews/{hobit_slug}/rerun",
        { params: { path: { review_id: id, hobit_slug: hobitSlug } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(mergeReviewKeys.detail(id), data);
    },
  });
}

/** Star a hobit or principle finding for this MR (the human-remarks tab). */
export function useAddRemarkMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      body: CreateMrRemarkInput,
    ): Promise<MergeReviewDetailOut> => {
      const { data, error } = await api.POST(
        "/api/v1/merge-reviews/{review_id}/remarks",
        { params: { path: { review_id: id } }, body },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(mergeReviewKeys.detail(id), data);
    },
  });
}

export function useDeleteRemarkMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (remarkId: string): Promise<void> => {
      const { error } = await api.DELETE(
        "/api/v1/merge-reviews/{review_id}/remarks/{remark_id}",
        { params: { path: { review_id: id, remark_id: remarkId } } },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mergeReviewKeys.detail(id) });
    },
  });
}

/**
 * Run this MR's principles against its diff. Returns the review with the requested checks
 * back at `pending`, so seeding the cache makes the detail query resume polling by itself.
 *
 * `principle_ids` omitted means "every enabled principle this repository is held to".
 */
export function useRunPrincipleChecksMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      principle_ids?: string[] | null;
    }): Promise<MergeReviewDetailOut> => {
      const { data, error } = await api.POST(
        "/api/v1/merge-reviews/{review_id}/principle-checks",
        { params: { path: { review_id: id } }, body },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(mergeReviewKeys.detail(id), data);
    },
  });
}
