/**
 * Query-key factory for the Launchpad. Everything hangs off `all`, so one
 * invalidation refreshes cards, detail, action, runs and the notification bell.
 */
export interface BookmarkListParams {
  q?: string;
  category_id?: string;
  starred?: boolean;
}

export const launchpadKeys = {
  all: ["launchpad"] as const,
  categories: () => [...launchpadKeys.all, "categories"] as const,
  lists: () => [...launchpadKeys.all, "list"] as const,
  list: (params: BookmarkListParams) =>
    [...launchpadKeys.lists(), params] as const,
  details: () => [...launchpadKeys.all, "detail"] as const,
  detail: (id: string) => [...launchpadKeys.details(), id] as const,
  action: (id: string) => [...launchpadKeys.detail(id), "action"] as const,
  runs: (id: string, page: number) =>
    [...launchpadKeys.detail(id), "runs", page] as const,
  notifications: () => [...launchpadKeys.all, "notifications"] as const,
};
