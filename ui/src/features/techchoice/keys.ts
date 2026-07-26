/**
 * Query-key factory for saved tech decisions. The list endpoint has no params,
 * so `list()` is parameterless; everything hangs off `all` so a single
 * invalidation cascades.
 */
export const techchoiceKeys = {
  all: ["tech-decisions"] as const,
  lists: () => [...techchoiceKeys.all, "list"] as const,
  list: () => [...techchoiceKeys.lists()] as const,
};
