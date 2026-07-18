export interface CouncilListParams {
  page: number;
  page_size: number;
}

export const councilKeys = {
  all: ["council"] as const,
  lists: () => [...councilKeys.all, "list"] as const,
  list: (params: CouncilListParams) =>
    [...councilKeys.lists(), params] as const,
  details: () => [...councilKeys.all, "detail"] as const,
  detail: (id: string) => [...councilKeys.details(), id] as const,
};
