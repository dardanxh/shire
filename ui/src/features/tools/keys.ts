/** Query-key factory for the tools feature. */
export const toolKeys = {
  all: ["tools"] as const,
  list: () => [...toolKeys.all, "list"] as const,
};
