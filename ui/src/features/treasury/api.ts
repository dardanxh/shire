import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { type TreasuryWindow, treasuryKeys } from "./keys";

/**
 * The overview's first fetch can take a few seconds — the backend's transcript scan is
 * incremental after that, and its own cache TTL matches this staleTime, so polling more
 * often would only re-read the server cache.
 */
export function useTreasuryOverviewQuery() {
  return useQuery({
    queryKey: treasuryKeys.overview(),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/treasury/overview");
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}

export function useTreasuryBreakdownQuery(window: TreasuryWindow) {
  return useQuery({
    queryKey: treasuryKeys.breakdown(window),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/treasury/breakdown", {
        params: { query: { window } },
      });
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}
