import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { memberKeys } from "@/features/members/keys";
import {
  type AssignMembersIn,
  api,
  type CreateTeamIn,
  type TeamDetailOut,
  type TeamOut,
  type UpdateTeamIn,
} from "@/lib/api";
import { teamKeys } from "./keys";

/** Every team with its member count. */
export function useTeamsQuery() {
  return useQuery({
    queryKey: teamKeys.lists(),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/teams");
      if (error) throw error;
      return data;
    },
  });
}

/** One team plus its assigned members. */
export function useTeamQuery(id: string) {
  return useQuery({
    queryKey: teamKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/teams/{team_id}", {
        params: { path: { team_id: id } },
      });
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** Team writes all touch who-is-on-which-team, so they invalidate members views too. */
function useTeamInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: teamKeys.all });
    queryClient.invalidateQueries({ queryKey: memberKeys.all });
  };
}

export function useCreateTeamMutation() {
  const invalidate = useTeamInvalidation();
  return useMutation({
    mutationFn: async (input: CreateTeamIn): Promise<TeamOut> => {
      const { data, error } = await api.POST("/api/v1/teams", { body: input });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateTeamMutation() {
  const invalidate = useTeamInvalidation();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      body: UpdateTeamIn;
    }): Promise<TeamOut> => {
      const { data, error } = await api.PATCH("/api/v1/teams/{team_id}", {
        params: { path: { team_id: input.id } },
        body: input.body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteTeamMutation() {
  const invalidate = useTeamInvalidation();
  return useMutation({
    mutationFn: async (teamId: string) => {
      const { error } = await api.DELETE("/api/v1/teams/{team_id}", {
        params: { path: { team_id: teamId } },
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Assign (or move) members into a team. */
export function useAssignMembersMutation() {
  const invalidate = useTeamInvalidation();
  return useMutation({
    mutationFn: async (input: {
      teamId: string;
      members: AssignMembersIn["members"];
    }): Promise<TeamDetailOut> => {
      const { data, error } = await api.POST(
        "/api/v1/teams/{team_id}/members",
        {
          params: { path: { team_id: input.teamId } },
          body: { members: input.members },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

/** Remove one member from a team (they become unassigned). */
export function useUnassignMemberMutation() {
  const invalidate = useTeamInvalidation();
  return useMutation({
    mutationFn: async (input: { teamId: string; memberId: string }) => {
      const { error } = await api.DELETE(
        "/api/v1/teams/{team_id}/members/{member_id}",
        {
          params: {
            path: { team_id: input.teamId, member_id: input.memberId },
          },
        },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
