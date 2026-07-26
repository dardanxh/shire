/**
 * Query-key factory for saved capacity calculations. The list endpoint has no
 * params, so `list()` is parameterless; everything hangs off `all` so a single
 * invalidation cascades.
 */
export const capacityKeys = {
  all: ["capacity-calculations"] as const,
  lists: () => [...capacityKeys.all, "list"] as const,
  list: () => [...capacityKeys.lists()] as const,
};
