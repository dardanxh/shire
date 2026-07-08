import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { briefingKeys } from "./keys";

/** All briefing items grouped by tier (NOW / DAILY / WEEKLY), newest first. */
export function useBriefingQuery() {
  return useQuery({
    queryKey: briefingKeys.tiered(),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/briefing");
      if (error) throw error;
      return data;
    },
  });
}
