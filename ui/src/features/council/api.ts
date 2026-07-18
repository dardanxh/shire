import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type CouncilTopicDetailOut } from "@/lib/api";
import { type CouncilListParams, councilKeys } from "./keys";

/** How often queries poll while a suggestion or debate is in flight. */
const POLL_MS = 2500;

/** Statuses with background work in flight — the suggestion job or a debate round. */
const ACTIVE_STATUSES = new Set([
  "suggesting",
  "r1_running",
  "r2_running",
  "synthesizing",
]);

export function isTopicActive(status: string): boolean {
  return ACTIVE_STATUSES.has(status);
}

/** List topics (server-paginated). Polls while any topic on the page is active. */
export function useCouncilTopicsQuery(params: CouncilListParams) {
  return useQuery({
    queryKey: councilKeys.list(params),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/council", {
        params: { query: params },
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: (query) => {
      const page = query.state.data;
      if (!page) return false;
      return page.items.some((t) => isTopicActive(t.status)) ? POLL_MS : false;
    },
  });
}

/**
 * One topic with its full debate state. Polls while the suggestion or a debate round is
 * running so takes fill in live, then stops on its own.
 */
export function useCouncilTopicQuery(id: string) {
  return useQuery({
    queryKey: councilKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/council/{topic_id}", {
        params: { path: { topic_id: id } },
      });
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
    refetchInterval: (query) => {
      const topic = query.state.data;
      if (!topic) return false;
      return isTopicActive(topic.status) ? POLL_MS : false;
    },
  });
}

export interface CreateCouncilTopicInput {
  name: string;
  description: string;
  repository_ids: string[];
  devils_advocate: boolean;
}

export function useCreateCouncilTopicMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      body: CreateCouncilTopicInput,
    ): Promise<CouncilTopicDetailOut> => {
      const { data, error } = await api.POST("/api/v1/council", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(councilKeys.detail(data.id), data);
      queryClient.invalidateQueries({ queryKey: councilKeys.lists() });
    },
  });
}

export function useUpdateCouncilTopicMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      body: CreateCouncilTopicInput,
    ): Promise<CouncilTopicDetailOut> => {
      const { data, error } = await api.PUT("/api/v1/council/{topic_id}", {
        params: { path: { topic_id: id } },
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(councilKeys.detail(id), data);
      queryClient.invalidateQueries({ queryKey: councilKeys.lists() });
    },
  });
}

export function useUpdateCouncilMembersMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (slugs: string[]): Promise<CouncilTopicDetailOut> => {
      const { data, error } = await api.PUT(
        "/api/v1/council/{topic_id}/members",
        { params: { path: { topic_id: id } }, body: { slugs } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(councilKeys.detail(id), data);
    },
  });
}

/** Start (or restart) the debate. Seeds the detail cache so polling resumes reactively. */
export function useConveneCouncilMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<CouncilTopicDetailOut> => {
      const { data, error } = await api.POST(
        "/api/v1/council/{topic_id}/convene",
        { params: { path: { topic_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(councilKeys.detail(id), data);
      queryClient.invalidateQueries({ queryKey: councilKeys.lists() });
    },
  });
}

export function useDeleteCouncilTopicMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await api.DELETE("/api/v1/council/{topic_id}", {
        params: { path: { topic_id: id } },
      });
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: councilKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: councilKeys.lists() });
    },
  });
}
