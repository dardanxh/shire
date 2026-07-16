import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { roadmapKeys } from "@/features/roadmaps";
import { api, type HomeStatusOut } from "@/lib/api";
import { homeKeys } from "./keys";

/**
 * The landing page's single read: Claude/engine status + checklist facts.
 * Refreshes on focus and every 30s so the checklist self-completes while the
 * user works in other tabs.
 */
export function useHomeStatusQuery() {
  return useQuery({
    queryKey: homeKeys.status(),
    queryFn: async (): Promise<HomeStatusOut> => {
      const { data, error } = await api.GET("/api/v1/home/status");
      if (error) throw error;
      return data;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

/**
 * The "Run drift" quick action: kick off a drift check for every active roadmap
 * that has a generated plan. Roadmaps with nothing open (or a check already in
 * flight) 409 — counted as skipped, never surfaced as errors.
 */
export function useRunDriftEverywhereMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ started: number; skipped: number }> => {
      const { data: page, error } = await api.GET("/api/v1/roadmaps", {
        params: { query: { page: 1, page_size: 50 } },
      });
      if (error) throw error;
      let started = 0;
      let skipped = 0;
      for (const roadmap of page.items) {
        if (roadmap.status !== "active" || roadmap.version_number === null) {
          skipped += 1;
          continue;
        }
        const { data: checks, error: driftError } = await api.POST(
          "/api/v1/roadmaps/{roadmap_id}/drift",
          { params: { path: { roadmap_id: roadmap.id } } },
        );
        if (driftError || !checks) skipped += 1;
        else started += checks.length;
      }
      return { started, skipped };
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: roadmapKeys.all }),
  });
}
