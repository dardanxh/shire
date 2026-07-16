/** Query-key factory for the home feature. */
export const homeKeys = {
  all: ["home"] as const,
  status: () => [...homeKeys.all, "status"] as const,
};
