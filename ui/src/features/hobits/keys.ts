export const hobitKeys = {
  all: ["hobits"] as const,
  lists: () => [...hobitKeys.all, "list"] as const,
  details: () => [...hobitKeys.all, "detail"] as const,
  detail: (slug: string) => [...hobitKeys.details(), slug] as const,
  runs: (slug: string) => [...hobitKeys.detail(slug), "runs"] as const,
};
