import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  api,
  type ExportIssuesOut,
  type RefreshPrsOut,
  type RepoRoadmapSliceOut,
  type RoadmapBurnupOut,
  type RoadmapDetailOut,
  type RoadmapDriftCheckOut,
  type RoadmapDriftStatusOut,
  type RoadmapExecutionOut,
  type RoadmapIn,
  type RoadmapItemOut,
  type RoadmapOut,
  type RoadmapQuadrant,
  type RoadmapRadarOut,
  type RoadmapsPage,
  type RoadmapVersionOut,
  type UpdateRoadmapItemIn,
} from "@/lib/api";
import { type RoadmapListParams, roadmapKeys } from "./keys";

/** How often roadmap queries poll while a generation job is still in flight. */
const GENERATING_POLL_MS = 2500;

export function quadrantOf(
  urgent: boolean,
  important: boolean,
): RoadmapQuadrant {
  if (important) return urgent ? "do_first" : "schedule";
  return urgent ? "delegate" : "later";
}

/** True while the roadmap's newest version is still being generated. */
export function isGenerating(
  roadmap: Pick<RoadmapDetailOut, "generation"> | undefined,
): boolean {
  return roadmap?.generation?.status === "pending";
}

/** True while any item's newest execution is still running on the engine. */
export function hasPendingExecution(
  roadmap: Pick<RoadmapDetailOut, "items"> | undefined,
): boolean {
  return (roadmap?.items ?? []).some(
    (item) => item.execution?.status === "pending",
  );
}

export function useRoadmapsQuery(params: RoadmapListParams) {
  return useQuery({
    queryKey: roadmapKeys.list(params),
    queryFn: async (): Promise<RoadmapsPage> => {
      const { data, error } = await api.GET("/api/v1/roadmaps", {
        params: { query: params },
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: (query) => {
      const page = query.state.data;
      if (!page) return false;
      return page.items.some((r) => r.generation_status === "pending")
        ? GENERATING_POLL_MS
        : false;
    },
  });
}

/**
 * One roadmap's full plan. Polls itself while a generation is in flight so the
 * detail page flips from skeleton to plan without a tracker surviving navigation.
 */
export function useRoadmapQuery(id: string, version?: number) {
  return useQuery({
    queryKey: roadmapKeys.detail(id, version),
    queryFn: async (): Promise<RoadmapDetailOut> => {
      const { data, error } = await api.GET("/api/v1/roadmaps/{roadmap_id}", {
        params: {
          path: { roadmap_id: id },
          query: { version: version ?? null },
        },
      });
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
    // Keep polling through generations AND in-flight executions, so PR links and
    // status flips land without a tracker that must survive reloads.
    refetchInterval: (query) =>
      isGenerating(query.state.data) || hasPendingExecution(query.state.data)
        ? GENERATING_POLL_MS
        : false,
  });
}

export function useRoadmapVersionsQuery(id: string) {
  return useQuery({
    queryKey: roadmapKeys.versions(id),
    queryFn: async (): Promise<RoadmapVersionOut[]> => {
      const { data, error } = await api.GET(
        "/api/v1/roadmaps/{roadmap_id}/versions",
        { params: { path: { roadmap_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

export function useRoadmapBurnupQuery(id: string, enabled = true) {
  return useQuery({
    queryKey: roadmapKeys.burnup(id),
    queryFn: async (): Promise<RoadmapBurnupOut> => {
      const { data, error } = await api.GET(
        "/api/v1/roadmaps/{roadmap_id}/charts/burnup",
        { params: { path: { roadmap_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "" && enabled,
  });
}

export function useRoadmapRadarQuery(id: string, enabled = true) {
  return useQuery({
    queryKey: roadmapKeys.radar(id),
    queryFn: async (): Promise<RoadmapRadarOut> => {
      const { data, error } = await api.GET(
        "/api/v1/roadmaps/{roadmap_id}/charts/radar",
        { params: { path: { roadmap_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "" && enabled,
  });
}

/**
 * Drift state: recent checks + open findings. Polls while any check is pending,
 * and on the settle-tick invalidates the detail so accepted statuses flow in.
 */
export function useDriftStatusQuery(id: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: roadmapKeys.drift(id),
    queryFn: async (): Promise<RoadmapDriftStatusOut> => {
      const { data, error } = await api.GET(
        "/api/v1/roadmaps/{roadmap_id}/drift",
        { params: { path: { roadmap_id: id } } },
      );
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: roadmapKeys.details() });
      return data;
    },
    enabled: id !== "",
    refetchInterval: (query) => {
      const status = query.state.data;
      if (!status) return false;
      return status.checks.some((c) => c.status === "pending")
        ? GENERATING_POLL_MS
        : false;
    },
  });
}

/**
 * Every roadmap covering one repository, sliced to that repo's items — the
 * repository detail's Roadmaps tab. Polls while a generation is in flight.
 */
export function useRepoRoadmapsQuery(repositoryId: string) {
  return useQuery({
    queryKey: roadmapKeys.repoSlices(repositoryId),
    queryFn: async (): Promise<RepoRoadmapSliceOut[]> => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/roadmaps",
        { params: { path: { repository_id: repositoryId } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: repositoryId !== "",
    refetchInterval: (query) => {
      const slices = query.state.data;
      if (!slices) return false;
      return slices.some((s) => s.generation_status === "pending")
        ? GENERATING_POLL_MS
        : false;
    },
  });
}

// ---- mutations ---------------------------------------------------------------

/** One read-only drift job per repository with open items. */
export function useRunDriftMutation(roadmapId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<RoadmapDriftCheckOut[]> => {
      const { data, error } = await api.POST(
        "/api/v1/roadmaps/{roadmap_id}/drift",
        { params: { path: { roadmap_id: roadmapId } } },
      );
      if (error) throw error;
      return data;
    },
    // Invalidating restarts the drift query's pending poll.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: roadmapKeys.drift(roadmapId) }),
  });
}

export function useAcceptDriftFindingMutation(roadmapId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (findingId: string): Promise<RoadmapItemOut> => {
      const { data, error } = await api.POST(
        "/api/v1/roadmaps/{roadmap_id}/drift/findings/{finding_id}/accept",
        { params: { path: { roadmap_id: roadmapId, finding_id: findingId } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: roadmapKeys.all }),
  });
}

export function useDismissDriftFindingMutation(roadmapId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (findingId: string): Promise<void> => {
      const { error } = await api.POST(
        "/api/v1/roadmaps/{roadmap_id}/drift/findings/{finding_id}/dismiss",
        { params: { path: { roadmap_id: roadmapId, finding_id: findingId } } },
      );
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: roadmapKeys.drift(roadmapId) }),
  });
}

/** Push open items as provider issues (synchronous — a handful of REST calls). */
export function useExportIssuesMutation(roadmapId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ExportIssuesOut> => {
      const { data, error } = await api.POST(
        "/api/v1/roadmaps/{roadmap_id}/export/issues",
        { params: { path: { roadmap_id: roadmapId } }, body: {} },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: roadmapKeys.details() }),
  });
}

export function useCreateRoadmapMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: RoadmapIn): Promise<RoadmapDetailOut> => {
      const { data, error } = await api.POST("/api/v1/roadmaps", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: roadmapKeys.all }),
  });
}

export function useUpdateRoadmapMutation(roadmapId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: RoadmapIn): Promise<RoadmapDetailOut> => {
      const { data, error } = await api.PUT("/api/v1/roadmaps/{roadmap_id}", {
        params: { path: { roadmap_id: roadmapId } },
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: roadmapKeys.all }),
  });
}

export function useDeleteRoadmapMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (roadmapId: string): Promise<void> => {
      const { error } = await api.DELETE("/api/v1/roadmaps/{roadmap_id}", {
        params: { path: { roadmap_id: roadmapId } },
      });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: roadmapKeys.all }),
  });
}

/** Re-plan: creates version N+1 pending; the detail query's poll takes it from there. */
export function useRegenerateRoadmapMutation(roadmapId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<RoadmapVersionOut> => {
      const { data, error } = await api.POST(
        "/api/v1/roadmaps/{roadmap_id}/versions",
        { params: { path: { roadmap_id: roadmapId } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: roadmapKeys.all }),
  });
}

/**
 * Partial item edit. Optimistically patches the cached current-version detail —
 * a board drag must not snap back while the PATCH is in flight.
 */
export function useUpdateRoadmapItemMutation(roadmapId: string) {
  const queryClient = useQueryClient();
  const detailKey = roadmapKeys.detail(roadmapId);
  return useMutation({
    mutationFn: async ({
      itemId,
      body,
    }: {
      itemId: string;
      body: UpdateRoadmapItemIn;
    }): Promise<RoadmapItemOut> => {
      const { data, error } = await api.PATCH(
        "/api/v1/roadmaps/{roadmap_id}/items/{item_id}",
        { params: { path: { roadmap_id: roadmapId, item_id: itemId } }, body },
      );
      if (error) throw error;
      return data;
    },
    onMutate: async ({ itemId, body }) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<RoadmapDetailOut>(detailKey);
      if (previous) {
        queryClient.setQueryData<RoadmapDetailOut>(detailKey, {
          ...previous,
          items: previous.items.map((item) => {
            if (item.id !== itemId) return item;
            const urgent = body.urgent ?? item.urgent;
            const important = body.important ?? item.important;
            return {
              ...item,
              urgent,
              important,
              quadrant: quadrantOf(urgent, important),
              status: body.status ?? item.status,
              effort: body.effort ?? item.effort,
            };
          }),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous)
        queryClient.setQueryData(detailKey, context.previous);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: roadmapKeys.all }),
  });
}

export function useAddDependencyMutation(roadmapId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      dependsOnItemId,
    }: {
      itemId: string;
      dependsOnItemId: string;
    }): Promise<RoadmapItemOut> => {
      const { data, error } = await api.POST(
        "/api/v1/roadmaps/{roadmap_id}/items/{item_id}/dependencies",
        {
          params: { path: { roadmap_id: roadmapId, item_id: itemId } },
          body: { depends_on_item_id: dependsOnItemId },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: roadmapKeys.details() }),
  });
}

export function useRemoveDependencyMutation(roadmapId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      dependsOnItemId,
    }: {
      itemId: string;
      dependsOnItemId: string;
    }): Promise<void> => {
      const { error } = await api.DELETE(
        "/api/v1/roadmaps/{roadmap_id}/items/{item_id}/dependencies/{depends_on_item_id}",
        {
          params: {
            path: {
              roadmap_id: roadmapId,
              item_id: itemId,
              depends_on_item_id: dependsOnItemId,
            },
          },
        },
      );
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: roadmapKeys.details() }),
  });
}

/** Dispatch the AI implementation run for an item (worktree → branch → PR). */
export function useExecuteItemMutation(roadmapId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string): Promise<RoadmapExecutionOut> => {
      const { data, error } = await api.POST(
        "/api/v1/roadmaps/{roadmap_id}/items/{item_id}/execute",
        { params: { path: { roadmap_id: roadmapId, item_id: itemId } } },
      );
      if (error) throw error;
      return data;
    },
    // Invalidating restarts the detail query's pending-execution poll.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: roadmapKeys.details() }),
  });
}

/** Provider-side PR sweep: merged PRs complete their items, closed ones bounce back. */
export function useRefreshPrsMutation(roadmapId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<RefreshPrsOut> => {
      const { data, error } = await api.POST(
        "/api/v1/roadmaps/{roadmap_id}/refresh-prs",
        { params: { path: { roadmap_id: roadmapId } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: roadmapKeys.all }),
  });
}

export type { RoadmapDetailOut, RoadmapItemOut, RoadmapOut, RoadmapVersionOut };
