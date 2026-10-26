/**
 * Query-key factory for AI Actions. Everything hangs off `all`, so one invalidation refreshes
 * the cards, the open action and the runner status.
 */
export const aiActionKeys = {
  all: ["ai-actions"] as const,
  list: () => [...aiActionKeys.all, "list"] as const,
  detail: (id: string) => [...aiActionKeys.all, "detail", id] as const,
  runner: () => [...aiActionKeys.all, "runner"] as const,
};
