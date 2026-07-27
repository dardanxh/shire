export const hobitKeys = {
  all: ["hobits"] as const,
  lists: () => [...hobitKeys.all, "list"] as const,
  details: () => [...hobitKeys.all, "detail"] as const,
  detail: (slug: string) => [...hobitKeys.details(), slug] as const,
  runs: (slug: string) => [...hobitKeys.detail(slug), "runs"] as const,
  assignments: (slug: string) =>
    [...hobitKeys.detail(slug), "assignments"] as const,
  guidance: (slug: string) => [...hobitKeys.detail(slug), "guidance"] as const,
};
