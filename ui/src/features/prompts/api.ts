import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  api,
  type PromptAnalysisOut,
  type PromptDetailOut,
  type PromptEnqueuedOut,
  type PromptIn,
  type PromptMetricsOut,
  type PromptReviewOut,
  type PromptSuggestionOut,
  type PromptsPage,
  type PromptTuning,
  type PromptVersionDetailOut,
  type PromptVersionIn,
  type PromptVersionOut,
  type RequestSuggestionIn,
  type StartArenaRunIn,
  type UpdatePromptIn,
} from "@/lib/api";
import { type PromptListParams, promptKeys } from "./keys";
import { EMPTY_TUNING, type TuningFormValues } from "./schemas";

/** How often the workbench polls while an engine job is in flight. */
const POLL_MS = 2500;

/** Statuses that mean an artefact is still being worked on. */
const ACTIVE_STATUSES = new Set(["pending", "running"]);

export function isArtefactActive(status: string): boolean {
  return ACTIVE_STATUSES.has(status);
}

/**
 * Normalise the API's tuning shape into the form's.
 *
 * The API models "not set" as `null` for the free-text knobs; a react-hook-form text input needs a
 * string, and feeding it `null` makes React warn and the field uncontrolled.
 */
export function tuningToForm(
  tuning: PromptTuning | undefined,
): TuningFormValues {
  if (!tuning) return EMPTY_TUNING;
  return {
    criticality: tuning.criticality ?? EMPTY_TUNING.criticality,
    sensitivity: tuning.sensitivity ?? EMPTY_TUNING.sensitivity,
    verbosity: tuning.verbosity ?? EMPTY_TUNING.verbosity,
    archetype: (tuning.archetype ??
      EMPTY_TUNING.archetype) as TuningFormValues["archetype"],
    output_format: (tuning.output_format ??
      EMPTY_TUNING.output_format) as TuningFormValues["output_format"],
    disclaimer: tuning.disclaimer ?? false,
    disclaimer_text: tuning.disclaimer_text ?? "",
    keywords: tuning.keywords ?? [],
    audience: tuning.audience ?? "",
    target_model: tuning.target_model ?? EMPTY_TUNING.target_model,
  };
}

/** The library, most recently touched first (server-paginated `Page` envelope). */
export function usePromptsQuery(params: PromptListParams) {
  return useQuery<PromptsPage>({
    queryKey: promptKeys.list(params),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/prompts", {
        params: { query: params },
      });
      if (error) throw error;
      return data;
    },
  });
}

/**
 * One prompt with its current version in full and the version list.
 *
 * Polls while any artefact on the current version is in flight, then stops on its own — the same
 * shape the council feature uses.
 */
export function usePromptQuery(id: string) {
  return useQuery<PromptDetailOut>({
    queryKey: promptKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/prompts/{prompt_id}", {
        params: { path: { prompt_id: id } },
      });
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
    refetchInterval: (query) => {
      const version = query.state.data?.current_version;
      if (!version) return false;
      const busy =
        version.suggestions.some((s) => isArtefactActive(s.status)) ||
        version.reviews.some((r) => isArtefactActive(r.status)) ||
        version.batches.some(
          (b) =>
            b.runs.some((r) => isArtefactActive(r.status)) ||
            (b.judgement !== null && isArtefactActive(b.judgement.status)),
        );
      return busy ? POLL_MS : false;
    },
  });
}

/**
 * Score a body without saving it — the live editor feedback.
 *
 * `keepPreviousData` matters here: without it every keystroke past the debounce blanks the panel
 * back to its skeleton, which reads as flicker rather than as an update.
 */
export function usePromptAnalysisQuery(body: string) {
  return useQuery<PromptAnalysisOut>({
    queryKey: promptKeys.analysis(body),
    queryFn: async () => {
      const { data, error } = await api.POST("/api/v1/prompts/analyze", {
        body: { body },
      });
      if (error) throw error;
      return data;
    },
    enabled: body.trim() !== "",
    placeholderData: keepPreviousData,
    // The verdict is a pure function of the body, so a cached result never goes stale.
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useCreatePromptMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: PromptIn): Promise<PromptDetailOut> => {
      const { data, error } = await api.POST("/api/v1/prompts", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptKeys.all });
    },
  });
}

export function useUpdatePromptMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdatePromptIn): Promise<PromptDetailOut> => {
      const { data, error } = await api.PUT("/api/v1/prompts/{prompt_id}", {
        params: { path: { prompt_id: id } },
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptKeys.all });
    },
  });
}

export function useDeletePromptMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await api.DELETE("/api/v1/prompts/{prompt_id}", {
        params: { path: { prompt_id: id } },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptKeys.all });
    },
  });
}

/** Append a version and make it current. Scored server-side on the way in. */
export function useCreatePromptVersionMutation(promptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      body: PromptVersionIn,
    ): Promise<PromptVersionDetailOut> => {
      const { data, error } = await api.POST(
        "/api/v1/prompts/{prompt_id}/versions",
        { params: { path: { prompt_id: promptId } }, body },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptKeys.all });
    },
  });
}

/** Roll the workbench back to an earlier version without discarding later ones. */
export function useSetCurrentVersionMutation(promptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (versionId: string): Promise<PromptDetailOut> => {
      const { data, error } = await api.POST(
        "/api/v1/prompts/{prompt_id}/versions/{version_id}/current",
        {
          params: { path: { prompt_id: promptId, version_id: versionId } },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptKeys.all });
    },
  });
}

/** Ask the model to rewrite this version. Returns 202; the suggestion settles via polling. */
export function useRequestSuggestionMutation(
  promptId: string,
  versionId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      body: RequestSuggestionIn,
    ): Promise<PromptEnqueuedOut> => {
      const { data, error } = await api.POST(
        "/api/v1/prompts/{prompt_id}/versions/{version_id}/suggest",
        {
          params: { path: { prompt_id: promptId, version_id: versionId } },
          body,
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptKeys.all });
    },
  });
}

/** One point per version for the trend chart. */
export function usePromptMetricsQuery(promptId: string) {
  return useQuery<PromptMetricsOut>({
    queryKey: promptKeys.metrics(promptId),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/prompts/{prompt_id}/metrics",
        { params: { path: { prompt_id: promptId } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: promptId !== "",
  });
}

/** Ask the model to score this version. Returns 202; the review settles via polling. */
export function useRequestReviewMutation(promptId: string, versionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<PromptEnqueuedOut> => {
      const { data, error } = await api.POST(
        "/api/v1/prompts/{prompt_id}/versions/{version_id}/review",
        { params: { path: { prompt_id: promptId, version_id: versionId } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptKeys.all });
    },
  });
}

/** Run this version against several models at once. Returns 202 with the created run rows. */
export function useStartArenaRunMutation(promptId: string, versionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: StartArenaRunIn) => {
      const { data, error } = await api.POST(
        "/api/v1/prompts/{prompt_id}/versions/{version_id}/runs",
        {
          params: { path: { prompt_id: promptId, version_id: versionId } },
          body,
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptKeys.all });
    },
  });
}

export type { PromptReviewOut, PromptSuggestionOut, PromptVersionOut };
