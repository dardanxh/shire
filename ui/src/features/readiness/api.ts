import { useQuery } from "@tanstack/react-query";

import { api, type ReadinessOverviewItemOut } from "@/lib/api";
import { readinessKeys } from "./keys";

/** Assistant-config readiness across every cloned repository. */
export function useReadinessOverviewQuery() {
  return useQuery<ReadinessOverviewItemOut[]>({
    queryKey: readinessKeys.overview(),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/ai-readiness/overview");
      if (error) throw error;
      return data;
    },
  });
}
