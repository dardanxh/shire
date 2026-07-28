/** Query-key factory for the members feature. */
export interface MembersParams {
  anonymize: boolean;
}

export const memberKeys = {
  all: ["members"] as const,
  overviews: () => [...memberKeys.all, "overview"] as const,
  overview: (params: MembersParams) =>
    [...memberKeys.overviews(), params] as const,
  details: () => [...memberKeys.all, "detail"] as const,
  detail: (id: string, params: MembersParams) =>
    [...memberKeys.details(), id, params] as const,
  activity: (id: string, params: MembersParams) =>
    [...memberKeys.all, "activity", id, params] as const,
  exclusions: () => [...memberKeys.all, "exclusions"] as const,
};
