/**
 * Query-key factory for the news feature. Everything hangs off `all` so a
 * single `all` invalidation cascades through TanStack's prefix matching.
 */
export interface NewsItemsParams {
  page: number;
  page_size: number;
  topic_id?: string;
  unread_only?: boolean;
}

export const newsKeys = {
  all: ["news"] as const,
  items: () => [...newsKeys.all, "items"] as const,
  itemsPage: (params: NewsItemsParams) =>
    [...newsKeys.items(), params] as const,
  topics: () => [...newsKeys.all, "topics"] as const,
  polls: () => [...newsKeys.all, "polls"] as const,
  recommendations: () => [...newsKeys.all, "recommendations"] as const,
  config: () => [...newsKeys.all, "config"] as const,
};
