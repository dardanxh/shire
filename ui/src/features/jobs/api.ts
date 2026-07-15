import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  api,
  type EngineConfigOut,
  type JobDetailOut,
  type JobOut,
  type JobStatsOut,
  type UpdateEngineConfigIn,
} from "@/lib/api";
import { type JobListParams, jobKeys } from "./keys";

/** How often job queries poll while any visible job is still pending/running. */
const POLL_MS = 2500;

const SETTLED = new Set(["succeeded", "failed", "cancelled"]);

/** True once the engine is done with the job (successfully or not). */
export function isJobSettled(job: Pick<JobOut, "status">): boolean {
  return SETTLED.has(job.status);
}

/**
 * All jobs (server-paginated). Polls while any job on the current page is
 * unsettled so statuses flip live, then stops on its own.
 */
export function useJobsQuery(params: JobListParams) {
  return useQuery({
    queryKey: jobKeys.list(params),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/jobs", {
        params: { query: params },
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: (query) => {
      const page = query.state.data;
      if (!page) return false; // first fetch is in flight
      return page.items.some((job) => !isJobSettled(job)) ? POLL_MS : false;
    },
  });
}

/** Aggregate token/cost totals for the stats header. Refreshes with the list poll cadence. */
export function useJobsStatsQuery() {
  return useQuery<JobStatsOut>({
    queryKey: jobKeys.stats(),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/jobs/stats");
      if (error) throw error;
      return data;
    },
    refetchInterval: 10_000,
  });
}

/** The engine's runtime settings (Config tab). */
export function useEngineConfigQuery() {
  return useQuery<EngineConfigOut>({
    queryKey: jobKeys.config(),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/jobs/config");
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateEngineConfigMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      body: UpdateEngineConfigIn,
    ): Promise<EngineConfigOut> => {
      const { data, error } = await api.PUT("/api/v1/jobs/config", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(jobKeys.config(), data);
    },
  });
}

/** Cancel a job that's still waiting in the queue. */
export function useCancelJobMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<JobDetailOut> => {
      const { data, error } = await api.POST("/api/v1/jobs/{job_id}/cancel", {
        params: { path: { job_id: id } },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(jobKeys.detail(data.id), data);
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    },
  });
}

/** Re-run a failed/cancelled job as a fresh job. */
export function useRetryJobMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<JobOut> => {
      const { data, error } = await api.POST("/api/v1/jobs/{job_id}/retry", {
        params: { path: { job_id: id } },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    },
  });
}

/** One job with its prompt and raw result. Polls until the job settles. */
export function useJobQuery(id: string) {
  return useQuery({
    queryKey: jobKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/jobs/{job_id}", {
        params: { path: { job_id: id } },
      });
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
    refetchInterval: (query) => {
      const job = query.state.data;
      if (!job) return false;
      return isJobSettled(job) ? false : POLL_MS;
    },
  });
}
