import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { homeKeys } from "@/features/home/keys";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types.gen";
import { type BookmarkListParams, launchpadKeys } from "./keys";

export type Bookmark = components["schemas"]["BookmarkResult"];
export type LaunchpadCategory =
  components["schemas"]["LaunchpadCategoryResult"];
export type BookmarkAction = components["schemas"]["BookmarkActionResult"];
export type ActionRun = components["schemas"]["ActionRunResult"];
export type LaunchpadNotifications =
  components["schemas"]["LaunchpadNotificationsResult"];
// Request bodies: openapi-typescript marks every field with a server default as
// required; the API accepts them omitted, so those fields are optional here.
type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type CreateBookmarkIn = WithOptional<
  components["schemas"]["CreateBookmark"],
  "starred" | "logo_kind"
>;
export type UpdateBookmarkIn = Partial<components["schemas"]["UpdateBookmark"]>;
export type UpsertActionIn = WithOptional<
  components["schemas"]["UpsertBookmarkAction"],
  "timeout_seconds" | "allow_writes" | "enabled" | "notify_on" | "timezone"
>;

export const NOTIFY_ON = ["new_items", "any_attention", "always"] as const;

/** Every change can move the Home attention count too. */
function useInvalidateLaunchpad() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: launchpadKeys.all });
    queryClient.invalidateQueries({ queryKey: homeKeys.status() });
  };
}

// --- categories ---------------------------------------------------------------

export function useLaunchpadCategoriesQuery() {
  return useQuery({
    queryKey: launchpadKeys.categories(),
    queryFn: async (): Promise<LaunchpadCategory[]> => {
      const { data, error } = await api.GET("/api/v1/launchpad/categories");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCategoryMutation() {
  const invalidate = useInvalidateLaunchpad();
  return useMutation({
    mutationFn: async (name: string): Promise<LaunchpadCategory> => {
      const { data, error } = await api.POST("/api/v1/launchpad/categories", {
        body: { name },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateCategoryMutation() {
  const invalidate = useInvalidateLaunchpad();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      position?: number;
    }): Promise<LaunchpadCategory> => {
      const { data, error } = await api.PATCH(
        "/api/v1/launchpad/categories/{category_id}",
        { params: { path: { category_id: id } }, body },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteCategoryMutation() {
  const invalidate = useInvalidateLaunchpad();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await api.DELETE(
        "/api/v1/launchpad/categories/{category_id}",
        { params: { path: { category_id: id } } },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

// --- bookmarks ----------------------------------------------------------------

/** Ordered server-side: starred, then most-used (decayed), then name. */
export function useBookmarksQuery(params: BookmarkListParams) {
  return useQuery({
    queryKey: launchpadKeys.list(params),
    queryFn: async (): Promise<Bookmark[]> => {
      const { data, error } = await api.GET("/api/v1/launchpad/bookmarks", {
        params: { query: params },
      });
      if (error) throw error;
      return data;
    },
    // Keeps action status dots fresh while scheduled runs land.
    refetchInterval: 60_000,
    placeholderData: (previous) => previous,
  });
}

export function useBookmarkQuery(id: string) {
  return useQuery({
    queryKey: launchpadKeys.detail(id),
    queryFn: async (): Promise<Bookmark> => {
      const { data, error } = await api.GET(
        "/api/v1/launchpad/bookmarks/{bookmark_id}",
        { params: { path: { bookmark_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

export function useCreateBookmarkMutation() {
  const invalidate = useInvalidateLaunchpad();
  return useMutation({
    mutationFn: async (body: CreateBookmarkIn): Promise<Bookmark> => {
      const { data, error } = await api.POST("/api/v1/launchpad/bookmarks", {
        body: body as components["schemas"]["CreateBookmark"],
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateBookmarkMutation(id: string) {
  const invalidate = useInvalidateLaunchpad();
  return useMutation({
    mutationFn: async (body: UpdateBookmarkIn): Promise<Bookmark> => {
      const { data, error } = await api.PATCH(
        "/api/v1/launchpad/bookmarks/{bookmark_id}",
        {
          params: { path: { bookmark_id: id } },
          body: body as components["schemas"]["UpdateBookmark"],
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteBookmarkMutation() {
  const invalidate = useInvalidateLaunchpad();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await api.DELETE(
        "/api/v1/launchpad/bookmarks/{bookmark_id}",
        { params: { path: { bookmark_id: id } } },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/**
 * Count a visit. Only refreshes lists in the background — the page has already
 * opened in a new tab, so nothing should flicker or toast.
 */
export function useRecordVisitMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<Bookmark> => {
      const { data, error } = await api.POST(
        "/api/v1/launchpad/bookmarks/{bookmark_id}/visit",
        { params: { path: { bookmark_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: launchpadKeys.lists() }),
  });
}

export function useUploadLogoMutation(id: string) {
  const invalidate = useInvalidateLaunchpad();
  return useMutation({
    mutationFn: async (dataUrl: string): Promise<Bookmark> => {
      const { data, error } = await api.PUT(
        "/api/v1/launchpad/bookmarks/{bookmark_id}/logo",
        {
          params: { path: { bookmark_id: id } },
          body: { data_url: dataUrl },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useRefreshLogoMutation(id: string) {
  const invalidate = useInvalidateLaunchpad();
  return useMutation({
    mutationFn: async (): Promise<Bookmark> => {
      const { data, error } = await api.POST(
        "/api/v1/launchpad/bookmarks/{bookmark_id}/logo/refresh",
        { params: { path: { bookmark_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

// --- the bookmark's action ----------------------------------------------------

/** The action, or `null` when the bookmark has none yet (a 404, not an error). */
export function useBookmarkActionQuery(id: string) {
  return useQuery({
    queryKey: launchpadKeys.action(id),
    queryFn: async (): Promise<BookmarkAction | null> => {
      const { data, error, response } = await api.GET(
        "/api/v1/launchpad/bookmarks/{bookmark_id}/action",
        { params: { path: { bookmark_id: id } } },
      );
      if (response.status === 404) return null;
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

export function useUpsertActionMutation(id: string) {
  const invalidate = useInvalidateLaunchpad();
  return useMutation({
    mutationFn: async (body: UpsertActionIn): Promise<BookmarkAction> => {
      const { data, error } = await api.PUT(
        "/api/v1/launchpad/bookmarks/{bookmark_id}/action",
        {
          params: { path: { bookmark_id: id } },
          body: body as components["schemas"]["UpsertBookmarkAction"],
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteActionMutation(id: string) {
  const invalidate = useInvalidateLaunchpad();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await api.DELETE(
        "/api/v1/launchpad/bookmarks/{bookmark_id}/action",
        { params: { path: { bookmark_id: id } } },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useRunActionMutation(id: string) {
  const invalidate = useInvalidateLaunchpad();
  return useMutation({
    mutationFn: async (): Promise<ActionRun> => {
      const { data, error } = await api.POST(
        "/api/v1/launchpad/bookmarks/{bookmark_id}/action/run",
        { params: { path: { bookmark_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

/** Runs, newest first. Polls while the newest run is still pending. */
export function useActionRunsQuery(id: string, page: number) {
  return useQuery({
    queryKey: launchpadKeys.runs(id, page),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/launchpad/bookmarks/{bookmark_id}/runs",
        {
          params: {
            path: { bookmark_id: id },
            query: { page, page_size: 10 },
          },
        },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
    refetchInterval: (query) =>
      query.state.data?.items.some((run) => run.status === "pending")
        ? 3_000
        : false,
  });
}

export function useMarkBookmarkReadMutation(id: string) {
  const invalidate = useInvalidateLaunchpad();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await api.POST(
        "/api/v1/launchpad/bookmarks/{bookmark_id}/read",
        { params: { path: { bookmark_id: id } } },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

// --- notifications ------------------------------------------------------------

export function useLaunchpadNotificationsQuery() {
  return useQuery({
    queryKey: launchpadKeys.notifications(),
    queryFn: async (): Promise<LaunchpadNotifications> => {
      const { data, error } = await api.GET("/api/v1/launchpad/notifications", {
        params: { query: { unread: true } },
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
    // The bell is the "tell me even when I'm elsewhere" surface.
    refetchIntervalInBackground: true,
  });
}

export function useMarkRunReadMutation() {
  const invalidate = useInvalidateLaunchpad();
  return useMutation({
    mutationFn: async (runId: string): Promise<void> => {
      const { error } = await api.POST("/api/v1/launchpad/runs/{run_id}/read", {
        params: { path: { run_id: runId } },
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useMarkAllReadMutation() {
  const invalidate = useInvalidateLaunchpad();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await api.POST(
        "/api/v1/launchpad/notifications/read-all",
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
