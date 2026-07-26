import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { components } from "@/lib/api-types.gen";
import type { SizingInputs } from "./calc";
import { capacityKeys } from "./keys";

export type CapacityCalculationOut =
  components["schemas"]["CapacityCalculationResult"];

/** All saved calculations (small list, no server pagination). */
export function useCapacityCalculationsQuery() {
  return useQuery({
    queryKey: capacityKeys.list(),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/capacity-calculations");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCapacityCalculationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      inputs: SizingInputs;
    }): Promise<CapacityCalculationOut> => {
      const { data, error } = await api.POST("/api/v1/capacity-calculations", {
        // Spread: the generated body wants a plain string-keyed object, which
        // the `SizingInputs` interface doesn't structurally provide.
        body: { name: input.name, inputs: { ...input.inputs } },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: capacityKeys.all });
    },
  });
}

export function useDeleteCapacityCalculationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE(
        "/api/v1/capacity-calculations/{calculation_id}",
        { params: { path: { calculation_id: id } } },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: capacityKeys.all });
    },
  });
}
