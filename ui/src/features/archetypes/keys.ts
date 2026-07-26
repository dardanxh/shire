import type { ArchetypeFamily } from "./schemas";

/** Default search for the list route — routes with `validateSearch` need an explicit `search`. */
export const LIST_SEARCH = { page: 1, size: 20 } as const;

export interface ArchetypeListParams {
  page: number;
  size: number;
  family?: ArchetypeFamily;
  q?: string;
  include_archived?: boolean;
}

/** Query-key factory. */
export const archetypeKeys = {
  all: ["archetypes"] as const,
  lists: () => [...archetypeKeys.all, "list"] as const,
  list: (params: ArchetypeListParams) =>
    [...archetypeKeys.lists(), params] as const,
  details: () => [...archetypeKeys.all, "detail"] as const,
  detail: (id: string) => [...archetypeKeys.details(), id] as const,
};
