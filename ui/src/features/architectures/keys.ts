/** Default search for the list route — routes with `validateSearch` need an explicit `search`. */
export const LIST_SEARCH = { tab: "blueprints" } as const;

export interface BlueprintListParams {
  family_tag?: string;
  q?: string;
  /** Use-case tag slug filter (reporting | realtime | ...). */
  use_case?: string;
  /** "seed" (Blueprints tab) | "user" (My architectures tab). */
  source?: string;
  /** true = starred only. */
  starred?: boolean;
}

/** Query-key factory. */
export const blueprintKeys = {
  all: ["blueprints"] as const,
  lists: () => [...blueprintKeys.all, "list"] as const,
  list: (params: BlueprintListParams) =>
    [...blueprintKeys.lists(), params] as const,
  details: () => [...blueprintKeys.all, "detail"] as const,
  detail: (id: string) => [...blueprintKeys.details(), id] as const,
};
