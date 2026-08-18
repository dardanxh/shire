import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type MemberExclusionOut } from "@/lib/api";
import { memberKeys } from "./keys";

/** Members ↔ repositories contributions graph (edges weighted by commits). */
export function useContributionsGraphQuery(params: {
  teamId: string | null;
  includeSubrepos: boolean;
  anonymize: boolean;
}) {
  return useQuery({
    queryKey: memberKeys.graph(params),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/members/contributions-graph",
        {
          params: {
            query: {
              team_id: params.teamId ?? undefined,
              include_subrepos: params.includeSubrepos,
              anonymize: params.anonymize,
            },
          },
        },
      );
      if (error) throw error;
      return data;
    },
  });
}

/** Which teams publish the most commits across tracked repositories. */
export function useTeamContributionsQuery() {
  return useQuery({
    queryKey: memberKeys.teamContributions(),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/members/team-contributions",
      );
      if (error) throw error;
      return data;
    },
  });
}

/** Fleet-wide members overview: portfolio health + aggregated identities. */
export function useMembersOverviewQuery(anonymize: boolean) {
  return useQuery({
    queryKey: memberKeys.overview({ anonymize }),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/members", {
        params: { query: { anonymize } },
      });
      if (error) throw error;
      return data;
    },
  });
}

/** One member's cross-repo breakdown. */
export function useMemberDetailQuery(id: string, anonymize: boolean) {
  return useQuery({
    queryKey: memberKeys.detail(id, { anonymize }),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/members/{identity_id}", {
        params: { path: { identity_id: id }, query: { anonymize } },
      });
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** One member's activity shape: weekly timeline, commit sizes, work pattern, repo shares. */
export function useMemberActivityQuery(id: string, anonymize: boolean) {
  return useQuery({
    queryKey: memberKeys.activity(id, { anonymize }),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/members/{identity_id}/activity",
        { params: { path: { identity_id: id }, query: { anonymize } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** User-managed opt-out / bot exclusion patterns. */
export function useExclusionsQuery() {
  return useQuery({
    queryKey: memberKeys.exclusions(),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/members/exclusions");
      if (error) throw error;
      return data;
    },
  });
}

interface AddExclusionInput {
  pattern: string;
  reason?: string | null;
  is_bot: boolean;
}

/** Exclude a member from every view (an email or a glob like `*[bot]*`). */
export function useAddExclusionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: AddExclusionInput,
    ): Promise<MemberExclusionOut> => {
      const { data, error } = await api.POST("/api/v1/members/exclusions", {
        body: input,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Removing/adding an exclusion changes who appears in every members view.
      queryClient.invalidateQueries({ queryKey: memberKeys.all });
    },
  });
}

/** Remove an exclusion so the matching member(s) reappear. */
export function useRemoveExclusionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (exclusionId: string) => {
      const { error } = await api.DELETE(
        "/api/v1/members/exclusions/{exclusion_id}",
        { params: { path: { exclusion_id: exclusionId } } },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memberKeys.all });
    },
  });
}

/** Identity merges: alias emails folded into a primary identity. */
export function useMergesQuery() {
  return useQuery({
    queryKey: memberKeys.merges(),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/members/merges");
      if (error) throw error;
      return data;
    },
  });
}

/** Merge identities: fold each alias email's contributions into the primary email. */
export function useAddMergesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      primary_email: string;
      alias_emails: string[];
    }) => {
      const { data, error } = await api.POST("/api/v1/members/merges", {
        body: input,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Merging changes identity aggregation in every members view.
      queryClient.invalidateQueries({ queryKey: memberKeys.all });
    },
  });
}

/** Undo one alias's merge so it appears as its own member again. */
export function useRemoveMergeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (mergeId: string) => {
      const { error } = await api.DELETE("/api/v1/members/merges/{merge_id}", {
        params: { path: { merge_id: mergeId } },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memberKeys.all });
    },
  });
}
