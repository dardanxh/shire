import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { toolKeys } from "./keys";

/** External analysis tools and their availability on the backend host. */
export function useToolsQuery() {
  return useQuery({
    queryKey: toolKeys.list(),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/tools");
      if (error) throw error;
      return data;
    },
  });
}
