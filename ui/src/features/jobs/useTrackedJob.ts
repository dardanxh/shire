import { useEffect, useRef, useState } from "react";

import type { JobDetailOut } from "@/lib/api";
import { isJobSettled, useJobQuery } from "./api";

/**
 * Follow one enqueued job to completion: `track(jobId)` after a trigger
 * mutation, poll until the engine settles it, then fire `onSettled` exactly
 * once (with the final job) and stop. `isTracking` drives the button's
 * "Generating…" state while the job is pending/running.
 */
export function useTrackedJob(onSettled: (job: JobDetailOut) => void) {
  const [jobId, setJobId] = useState("");
  const { data: job } = useJobQuery(jobId);
  const callback = useRef(onSettled);
  callback.current = onSettled;

  // Side effect: hand the settled job to the consumer once, then stop tracking.
  useEffect(() => {
    if (jobId !== "" && job && job.id === jobId && isJobSettled(job)) {
      setJobId("");
      callback.current(job);
    }
  }, [job, jobId]);

  return { track: setJobId, isTracking: jobId !== "" };
}
