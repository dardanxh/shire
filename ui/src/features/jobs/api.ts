import { useQuery } from "@tanstack/react-query";

import { api, type JobOut } from "@/lib/api";
import { type JobListParams, jobKeys } from "./keys";

/** How often job queries poll while any visible job is still pending/running. */
const POLL_MS = 2500;

const SETTLED = new Set(["succeeded", "failed"]);

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
