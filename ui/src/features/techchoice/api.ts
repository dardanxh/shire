import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { components } from "@/lib/api-types.gen";
import { techchoiceKeys } from "./keys";
import type { TechchoiceSearch } from "./schemas";

export type TechDecisionOut = components["schemas"]["TechDecisionResult"];

/** All saved decisions (small list, no server pagination). */
export function useTechDecisionsQuery() {
  return useQuery({
    queryKey: techchoiceKeys.list(),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/tech-decisions");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateTechDecisionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      inputs: TechchoiceSearch;
    }): Promise<TechDecisionOut> => {
      const { data, error } = await api.POST("/api/v1/tech-decisions", {
        // Spread: the generated body wants a plain string-keyed object.
        body: { name: input.name, inputs: { ...input.inputs } },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: techchoiceKeys.all });
    },
  });
}

export function useDeleteTechDecisionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE(
        "/api/v1/tech-decisions/{decision_id}",
        {
          params: { path: { decision_id: id } },
        },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: techchoiceKeys.all });
    },
  });
}
