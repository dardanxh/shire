/** Params for the server-paginated checks list. */
export interface ComplianceListParams {
  page: number;
  size: number;
}

export const complianceKeys = {
  all: ["compliance"] as const,
  lists: () => [...complianceKeys.all, "list"] as const,
  list: (params: ComplianceListParams) =>
    [...complianceKeys.lists(), params] as const,
};
