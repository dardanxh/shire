import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import {
  type AnalysisDeltaOut,
  type AnalysisOut,
  type AnalysisSnapshotOut,
  type ArchitectureOut,
  type ArtifactVersionOut,
  api,
  type BranchesOut,
  type BranchNamesOut,
  type CicdExecutionOut,
  type CicdStatusOut,
  type CodeAgeOut,
  type CodebaseOverviewOut,
  type CodeMapOut,
  type ContextMarkdownOut,
  type CouplingOut,
  type DependencyFreshnessOut,
  type DependencyInventoryOut,
  type GraphOut,
  type HobitOut,
  type HobitRunOut,
  type InspectionDetailOut,
  type InspectionOverviewOut,
  type JobOut,
  type QuestionOut,
  type ReadinessExecutionOut,
  type ReadinessStatusOut,
  type RepositoryOut,
  type RunInspectionsOut,
  type TechStackOut,
  type ToolLogOut,
  type ToolName,
} from "@/lib/api";
import { type RepositoryListParams, repositoryKeys } from "./keys";

/** Statuses meaning the background ingest pipeline is still working on the repo. */
export const INGEST_IN_PROGRESS = new Set([
  "registered",
  "cloning",
  "analyzing",
]);
const INGEST_POLL_MS = 2500;

export function isIngesting(repo: { status: string } | null | undefined) {
  return repo != null && INGEST_IN_PROGRESS.has(repo.status);
}

/**
 * List repositories (server-paginated: returns the `Page` envelope). Ingestion is
 * asynchronous — the list polls while any visible repo is still cloning/analyzing,
 * then stops on its own.
 */
export function useRepositoriesQuery(
  params: RepositoryListParams,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: repositoryKeys.list(params),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/repositories", {
        params: { query: params },
      });
      if (error) throw error;
      return data;
    },
    enabled,
    refetchInterval: (q) =>
      q.state.data?.items.some(isIngesting) ? INGEST_POLL_MS : false,
  });
}

/**
 * The starred repositories — a flat, unpaginated list (the hub's Starred tab). Polls on the
 * same terms as the main list so a starred repo mid-ingest still updates in place.
 */
export function useStarredRepositoriesQuery({
  enabled = true,
}: {
  enabled?: boolean;
} = {}) {
  return useQuery({
    queryKey: repositoryKeys.starred(),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/repositories/starred");
      if (error) throw error;
      return data;
    },
    enabled,
    refetchInterval: (q) =>
      q.state.data?.some(isIngesting) ? INGEST_POLL_MS : false,
  });
}

/** Star or unstar a repository — a bookmark, nothing is cloned or re-analyzed. */
export function useSetRepositoryStarredMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      starred,
    }: {
      id: string;
      starred: boolean;
    }): Promise<RepositoryOut> => {
      const { data, error } = await api.PUT(
        "/api/v1/repositories/{repository_id}/star",
        {
          params: { path: { repository_id: id } },
          body: { starred },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repositoryKeys.all });
    },
  });
}

/**
 * A single repository by id. Disabled while `id` is empty. Polls while the ingest
 * pipeline is running; when it settles, every derived surface (analysis, context,
 * branches, …) is invalidated so the view fills in with the fresh data.
 */
export function useRepositoryQuery(id: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: repositoryKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
    refetchInterval: (q) =>
      isIngesting(q.state.data) ? INGEST_POLL_MS : false,
  });

  const ingesting = isIngesting(query.data);
  const wasIngesting = useRef(false);
  // Side effect: on the ingesting→settled transition, refresh everything derived from the repo.
  useEffect(() => {
    if (wasIngesting.current && !ingesting) {
      queryClient.invalidateQueries({ queryKey: repositoryKeys.all });
    }
    wasIngesting.current = ingesting;
  }, [ingesting, queryClient]);

  return query;
}

/**
 * A repository's latest analysis. Resolves to `null` (not an error) when the
 * backend has no analysis yet (404), so the view can show a "pending" state.
 */
export function useAnalysisQuery(id: string) {
  return useQuery<AnalysisOut | null>({
    queryKey: repositoryKeys.analysis(id),
    queryFn: async () => {
      const { data, error, response } = await api.GET(
        "/api/v1/repositories/{repository_id}/analysis",
        { params: { path: { repository_id: id } } },
      );
      if (response.status === 404) return null;
      if (error) throw error;
      return data ?? null;
    },
    enabled: id !== "",
  });
}

/**
 * Live branch overview: count, merged/stale tallies, and the most active branch
 * tips. Computed against the clone on request (with a best-effort remote fetch),
 * so a `staleTime` keeps tab flips from re-triggering that work.
 */
export function useBranchesQuery(id: string) {
  return useQuery<BranchesOut>({
    queryKey: repositoryKeys.branches(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/branches",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
    staleTime: 60_000,
  });
}

/**
 * Every branch name (cheap, no per-branch plumbing) — feeds branch pickers.
 * Unlike `useBranchesQuery` this is the complete list, not the top active tips.
 */
export function useBranchNamesQuery(id: string) {
  return useQuery<BranchNamesOut>({
    queryKey: repositoryKeys.branchNames(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/branches/names",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
    staleTime: 60_000,
  });
}

/**
 * A repository's context pack rendered as Markdown — the generated text plus any saved
 * user override (`edited`) and the `effective` one the agent reads. Resolves to `null`
 * (not an error) when the backend has no analysis yet (404), mirroring `useAnalysisQuery`.
 */
export function useContextMarkdownQuery(id: string) {
  return useQuery<ContextMarkdownOut | null>({
    queryKey: repositoryKeys.context(id),
    queryFn: async () => {
      const { data, error, response } = await api.GET(
        "/api/v1/repositories/{repository_id}/context/markdown",
        { params: { path: { repository_id: id } } },
      );
      if (response.status === 404) return null;
      if (error) throw error;
      return data ?? null;
    },
    enabled: id !== "",
  });
}

/** Save a user-authored Markdown override for a repository's context. */
export function useSaveContextMarkdownMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (markdown: string): Promise<ContextMarkdownOut> => {
      const { data, error } = await api.PUT(
        "/api/v1/repositories/{repository_id}/context/markdown",
        { params: { path: { repository_id: id } }, body: { markdown } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(repositoryKeys.context(id), data);
    },
  });
}

/** Drop the override and fall back to the generated Markdown. */
export function useResetContextMarkdownMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ContextMarkdownOut> => {
      const { data, error } = await api.DELETE(
        "/api/v1/repositories/{repository_id}/context/markdown",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(repositoryKeys.context(id), data);
    },
  });
}

/**
 * This repository's hobit runs, newest first. Runs are now enqueued (`queued` status) and
 * settled by the engine service, so this query polls while any run is queued; when the last
 * queued run settles it refreshes everything a finished run can touch (assigned-hobit cards,
 * context narrative, global hobits list, briefing feed).
 */
export function useRepoHobitRunsQuery(id: string) {
  const queryClient = useQueryClient();
  const query = useQuery<HobitRunOut[]>({
    queryKey: repositoryKeys.hobitRuns(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/hobits/runs",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
    refetchInterval: (q) =>
      q.state.data?.some((r) => r.status === "queued") ? 2500 : false,
  });

  const hasQueued = query.data?.some((r) => r.status === "queued") ?? false;
  const hadQueued = useRef(false);
  // Side effect: on the queued→settled transition, refresh the run's downstream surfaces.
  useEffect(() => {
    if (hadQueued.current && !hasQueued) {
      queryClient.invalidateQueries({ queryKey: repositoryKeys.hobits(id) });
      queryClient.invalidateQueries({ queryKey: repositoryKeys.context(id) });
      queryClient.invalidateQueries({ queryKey: ["hobits"] });
      queryClient.invalidateQueries({ queryKey: ["briefing"] });
    }
    hadQueued.current = hasQueued;
  }, [hasQueued, id, queryClient]);

  return query;
}

/**
 * Run the Repo-Onboarding hobit against this repository (blocking — the agent explores the
 * clone and writes an L3 narrative into the context pack). On success, invalidate the context
 * markdown so the new narrative surfaces.
 */
export function useRunOnboardingMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<HobitRunOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/hobits/{slug}/run",
        { params: { path: { repository_id: id, slug: "repo-onboarding" } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repositoryKeys.context(id) });
      queryClient.invalidateQueries({ queryKey: repositoryKeys.hobitRuns(id) });
    },
  });
}

/** The hobits assigned to this repository (its access allow-list). */
export function useRepoHobitsQuery(id: string) {
  return useQuery<HobitOut[]>({
    queryKey: repositoryKeys.hobits(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/hobits",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** Replace the hobits assigned to a repository (id in the variables — the wizard only knows it
 * after ingest). */
export function useSetRepoHobitsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      slugs,
    }: {
      id: string;
      slugs: string[];
    }): Promise<HobitOut[]> => {
      const { data, error } = await api.PUT(
        "/api/v1/repositories/{repository_id}/hobits",
        { params: { path: { repository_id: id } }, body: { slugs } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data, vars) => {
      queryClient.setQueryData(repositoryKeys.hobits(vars.id), data);
    },
  });
}

/** Run an assigned hobit against this repository (blocking). */
export function useRunRepoHobitMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (slug: string): Promise<HobitRunOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/hobits/{slug}/run",
        { params: { path: { repository_id: id, slug } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repositoryKeys.hobitRuns(id) });
      queryClient.invalidateQueries({ queryKey: ["hobits"] });
      queryClient.invalidateQueries({ queryKey: ["briefing"] });
      // The CI/CD tab reports its own hobit's pendingness (and harvests its suggestions), so it
      // has to learn about a fresh run before its poll can start.
      queryClient.invalidateQueries({ queryKey: repositoryKeys.cicd(id) });
    },
  });
}

/** Set how often an assigned hobit runs on this repo (manual | hourly | daily | weekly | cron:<expr>). */
export function useSetCadenceMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      slug,
      cadence,
    }: {
      slug: string;
      cadence: string;
    }): Promise<HobitOut[]> => {
      const { data, error } = await api.PUT(
        "/api/v1/repositories/{repository_id}/hobits/{slug}/cadence",
        { params: { path: { repository_id: id, slug } }, body: { cadence } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(repositoryKeys.hobits(id), data);
    },
  });
}

/**
 * Change-gated run of an assigned hobit: runs only if the repo moved since the last result,
 * otherwise records a skip — the same logic the scheduler applies. Blocking when it runs.
 */
export function useRefreshHobitMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (slug: string): Promise<HobitRunOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/hobits/{slug}/refresh",
        { params: { path: { repository_id: id, slug } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repositoryKeys.hobitRuns(id) });
      queryClient.invalidateQueries({ queryKey: repositoryKeys.hobits(id) });
      queryClient.invalidateQueries({ queryKey: ["hobits"] });
      queryClient.invalidateQueries({ queryKey: ["briefing"] });
    },
  });
}

/** Register a repository by git URL — the clone/analyze pipeline runs in the background. */
export function useIngestRepositoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      url,
      subpath,
      connectionId,
      toolIds,
    }: {
      url: string;
      /** Monorepo focus: scope the record to one subdirectory of the repo. */
      subpath?: string | null;
      connectionId?: string | null;
      toolIds?: string[] | null;
    }): Promise<RepositoryOut> => {
      const { data, error } = await api.POST("/api/v1/repositories", {
        body: {
          url,
          subpath: subpath || null,
          connection_id: connectionId || null,
          tool_ids: toolIds ?? null,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repositoryKeys.all });
    },
  });
}

/** Start a background pull + re-analysis; the repo status polls track progress. */
const QUESTION_SETTLED = new Set(["succeeded", "failed", "cancelled"]);

/**
 * Asked questions with their answers, newest first. Polls while any answer is
 * still being worked on by the engine, then stops on its own.
 */
export function useRepoQuestionsQuery(id: string) {
  return useQuery<QuestionOut[]>({
    queryKey: repositoryKeys.questions(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/questions",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
    refetchInterval: (query) =>
      query.state.data?.some((q) => !QUESTION_SETTLED.has(q.status))
        ? 2500
        : false,
  });
}

/** Ask a free-form question about the repository (answered by an engine job). */
export function useAskQuestionMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (question: string): Promise<QuestionOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/questions",
        { params: { path: { repository_id: id } }, body: { question } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repositoryKeys.questions(id) });
    },
  });
}

/** Switch the active branch: checkout + pull + full re-analysis; generated artifacts are
 * cleared and regenerate on demand (blocking, like refresh). */
export function useSwitchBranchMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (branch: string): Promise<RepositoryOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/branch",
        { params: { path: { repository_id: id } }, body: { branch } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repositoryKeys.all });
    },
  });
}

export function useRefreshRepositoryMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<RepositoryOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/refresh",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repositoryKeys.all });
    },
  });
}

/** Id-per-call refresh variant for bulk actions on the repositories list. */
export function useRefreshRepositoriesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<RepositoryOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/refresh",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repositoryKeys.all });
    },
  });
}

/** Delete a repository and everything derived from it (analysis, artifacts, hobit runs, briefing
 * items, and the clone). A local repo's own files are left untouched. */
export function useDeleteRepositoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await api.DELETE(
        "/api/v1/repositories/{repository_id}",
        {
          params: { path: { repository_id: id } },
        },
      );
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: repositoryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: repositoryKeys.all });
      queryClient.invalidateQueries({ queryKey: ["hobits"] });
      queryClient.invalidateQueries({ queryKey: ["briefing"] });
    },
  });
}

/**
 * Codebase-graph (emerge) status for a repository: whether an artifact exists
 * and the URL to iframe. Cheap poll target; independent of the analysis query.
 */
export function useGraphQuery(id: string) {
  return useQuery<GraphOut>({
    queryKey: repositoryKeys.graph(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/graph",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** (Re)generate the codebase graph. Blocking — emerge can take a while on big repos. */
export function useGenerateGraphMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<GraphOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/graph/run",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(repositoryKeys.graph(id), data);
    },
  });
}

/** Code age (git-of-theseus) status: whether the SVG exists + its URL. */
export function useCodeAgeQuery(id: string) {
  return useQuery<CodeAgeOut>({
    queryKey: repositoryKeys.codeAge(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/code-age",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** (Re)generate the code-age chart. Blocking — walks full git history. */
export function useGenerateCodeAgeMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<CodeAgeOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/code-age/run",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) =>
      queryClient.setQueryData(repositoryKeys.codeAge(id), data),
  });
}

/** Temporal coupling (code-maat) status: ranked file pairs that change together. */
export function useCouplingQuery(id: string) {
  return useQuery<CouplingOut>({
    queryKey: repositoryKeys.coupling(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/coupling",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** (Re)compute temporal coupling. Blocking — mines full git history. */
export function useGenerateCouplingMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<CouplingOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/coupling/run",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) =>
      queryClient.setQueryData(repositoryKeys.coupling(id), data),
  });
}

/**
 * The Dependencies tab's dataset: declared dependencies plus manifest coverage. Polls while an
 * AI dependency scan is in flight so its findings appear as soon as the job settles.
 */
export function useDependencyInventoryQuery(id: string) {
  return useQuery<DependencyInventoryOut>({
    queryKey: repositoryKeys.dependencies(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/dependencies",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
    refetchInterval: (query) => (query.state.data?.ai_pending ? 3000 : false),
  });
}

/** Have the engine read the dependencies out of the repo (monorepos, unparsed manifests). */
export function useAiDependencyScanMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<DependencyInventoryOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/dependencies/ai-scan",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) =>
      queryClient.setQueryData(repositoryKeys.dependencies(id), data),
  });
}

/**
 * The CI/CD tab's dataset: detected pipeline files, the engine's map of environments and
 * promotion flow, its suggestions, and the implement-with-AI runs. Polls while any of the three
 * engines is working — the scan, the ci-cd hobit, or an implement run. Pendingness is reported by
 * the resource (derived from unsettled job rows), so it survives a reload.
 */
export function useCicdStatusQuery(id: string) {
  return useQuery<CicdStatusOut>({
    queryKey: repositoryKeys.cicd(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/cicd",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
    refetchInterval: (query) => {
      const status = query.state.data;
      if (!status) return false;
      const working =
        status.scan_pending ||
        status.hobit_pending ||
        status.executions.some((execution) => execution.status === "pending");
      return working ? 3000 : false;
    },
  });
}

/** Map the delivery pipeline with the engine. Returns the full status (already `scan_pending`),
 * so writing it into the cache starts the poll without a second request. */
export function useCicdScanMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<CicdStatusOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/cicd/scan",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) =>
      queryClient.setQueryData(repositoryKeys.cicd(id), data),
  });
}

/** Implement the chosen suggestions on a fresh local `cicd/*` branch. The execution row carries
 * pendingness, so invalidating the status is enough to start the poll. */
export function useApplyCicdSuggestionsMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (suggestionIds: string[]): Promise<CicdExecutionOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/cicd/apply",
        {
          params: { path: { repository_id: id } },
          body: { suggestion_ids: suggestionIds },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repositoryKeys.cicd(id) });
    },
  });
}

/** Cached dependency-freshness (latest versions + upgrade gaps + AI gains). */
export function useDependencyFreshnessQuery(id: string) {
  return useQuery<DependencyFreshnessOut>({
    queryKey: repositoryKeys.dependencyFreshness(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/dependency-freshness",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
    // The AI "gain" lines land via an engine job after the deterministic columns; poll while
    // that job is in flight so the cells fill in, then stop on their own.
    refetchInterval: (query) =>
      query.state.data?.gains_pending ? 2500 : false,
  });
}

/** Fetch latest versions from PyPI and compute gaps (fast, synchronous). The AI gain lines
 * arrive via an engine job — the freshness query above polls while `gains_pending`. */
export function useGenerateDependencyFreshnessMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<DependencyFreshnessOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/dependency-freshness/run",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) =>
      queryClient.setQueryData(repositoryKeys.dependencyFreshness(id), data),
  });
}

/** Every complete snapshot's headline scalars, oldest first — the evolution timeline. */
export function useAnalysisHistoryQuery(id: string) {
  return useQuery<AnalysisSnapshotOut[]>({
    queryKey: repositoryKeys.analysisHistory(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/analysis/history",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/**
 * Deterministic diff between two snapshots (defaults: previous -> latest). Resolves to
 * `null` when fewer than two snapshots exist (409), so the panel can show a hint.
 */
export function useAnalysisDeltaQuery(
  id: string,
  fromId: string | null,
  toId: string | null,
) {
  return useQuery<AnalysisDeltaOut | null>({
    queryKey: repositoryKeys.analysisDelta(id, fromId, toId),
    queryFn: async () => {
      const { data, error, response } = await api.GET(
        "/api/v1/repositories/{repository_id}/analysis/delta",
        {
          params: {
            path: { repository_id: id },
            query: {
              from_id: fromId ?? undefined,
              to_id: toId ?? undefined,
            },
          },
        },
      );
      if (response.status === 409) return null;
      if (error) throw error;
      return data ?? null;
    },
    enabled: id !== "",
  });
}

/** Enqueue the "what changed since last check" narrative. Caller tracks the job and
 * invalidates the delta when it settles. */
export function useExplainDeltaMutation(id: string) {
  return useMutation({
    mutationFn: async (pair: {
      from_id: string | null;
      to_id: string | null;
    }): Promise<JobOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/analysis/delta/explain",
        {
          params: { path: { repository_id: id } },
          body: { from_id: pair.from_id, to_id: pair.to_id },
        },
      );
      if (error) throw error;
      return data;
    },
  });
}

/** Version history of a Claude repo artifact (architecture kind / overview / tech stack). */
export function useArtifactVersionsQuery(
  id: string,
  artifact: string,
  kind: string | null = null,
) {
  return useQuery<ArtifactVersionOut[]>({
    queryKey: repositoryKeys.artifactVersions(id, artifact, kind),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/artifact-versions",
        {
          params: {
            path: { repository_id: id },
            query: { artifact, kind: kind ?? undefined },
          },
        },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** Architecture-diagram catalog + any previously generated Mermaid diagrams. */
export function useArchitectureQuery(id: string) {
  return useQuery<ArchitectureOut>({
    queryKey: repositoryKeys.architecture(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/architecture",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** Enqueue one Mermaid diagram generation. Returns the job — the caller tracks it (via
 * `useTrackedJob`) and invalidates the architecture catalog when it settles. */
export function useGenerateArchitectureDiagramMutation(id: string) {
  return useMutation({
    mutationFn: async (kind: string): Promise<JobOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/architecture/{kind}/run",
        { params: { path: { repository_id: id, kind } } },
      );
      if (error) throw error;
      return data;
    },
  });
}

/** Cached big-picture codebase overview (what it is, why, key capabilities). */
export function useCodebaseOverviewQuery(id: string) {
  return useQuery<CodebaseOverviewOut>({
    queryKey: repositoryKeys.codebaseOverview(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/codebase-overview",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** Enqueue the big-picture overview generation. Returns the job — the caller tracks it and
 * invalidates the overview when it settles. */
export function useGenerateCodebaseOverviewMutation(id: string) {
  return useMutation({
    mutationFn: async (): Promise<JobOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/codebase-overview/run",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
  });
}

/** Cached tech-stack detection, resolved against the technology catalog. */
export function useTechStackQuery(id: string) {
  return useQuery<TechStackOut>({
    queryKey: repositoryKeys.techStack(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/tech-stack",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** Enqueue tech-stack detection. Returns the job — the caller tracks it and invalidates
 * the tech-stack query when it settles. */
export function useGenerateTechStackMutation(id: string) {
  return useMutation({
    mutationFn: async (): Promise<JobOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/tech-stack/run",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
  });
}

/**
 * AI-assistant readiness: instant artifact scan plus persisted suggestions and
 * make-ai-ready executions. Polls while an execution is pending so an in-flight
 * run's branch/summary (and flipped suggestion statuses) land on their own.
 */
/** Inspection completion counts + 30-day commit activity for every repository — one read
 * behind the list table's Activity and Checks columns. */
export function useInspectionsOverviewQuery(days = 30) {
  return useQuery<InspectionOverviewOut[]>({
    queryKey: repositoryKeys.inspectionsOverview(days),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/inspections/overview", {
        params: { query: { days } },
      });
      if (error) throw error;
      return data;
    },
  });
}

/** Every inspection's state for one repository (the Suggested Actions checklist). Polls
 * while anything is in flight — server-reported, so it survives a reload. */
export function useInspectionsQuery(id: string) {
  return useQuery<InspectionDetailOut>({
    queryKey: repositoryKeys.inspections(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/inspections",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.in_flight) ? 4000 : false,
  });
}

/** Start inspections for a repository. `keys: null` runs every bulk-eligible inspection
 * that isn't done yet; an explicit list runs exactly those. Never touches hobits or
 * principles. Preconditions come back in `skipped` rather than as an error. */
export function useRunInspectionsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      repositoryId,
      keys = null,
    }: {
      repositoryId: string;
      keys?: string[] | null;
    }): Promise<RunInspectionsOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/inspections/run",
        {
          params: { path: { repository_id: repositoryId } },
          body: { keys },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (_result, { repositoryId }) => {
      queryClient.invalidateQueries({
        queryKey: repositoryKeys.inspections(repositoryId),
      });
      queryClient.invalidateQueries({
        queryKey: [...repositoryKeys.all, "inspections-overview"],
      });
    },
  });
}

export function useAiReadinessQuery(id: string) {
  return useQuery<ReadinessStatusOut>({
    queryKey: repositoryKeys.aiReadiness(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/ai-readiness",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
    refetchInterval: (query) =>
      query.state.data?.executions?.some((e) => e.status === "pending")
        ? 4000
        : false,
  });
}

/** Enqueue the AI readiness-suggestion run. Returns the job — the caller tracks it
 * (via `useTrackedJob`) and invalidates the readiness query when it settles. */
export function useSuggestReadinessMutation(id: string) {
  return useMutation({
    mutationFn: async (): Promise<JobOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/ai-readiness/suggest",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
  });
}

/** Implement the selected suggestions on a fresh `ai-ready/*` branch (non-blocking —
 * the readiness query polls while the new execution is pending). */
export function useApplyReadinessMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      suggestionIds: string[],
    ): Promise<ReadinessExecutionOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/ai-readiness/apply",
        {
          params: { path: { repository_id: id } },
          body: { suggestion_ids: suggestionIds },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: repositoryKeys.aiReadiness(id),
      });
    },
  });
}

/** Code-city map (CodeCharta) status: whether the map exists + the viewer URL. */
export function useCodeMapQuery(id: string) {
  return useQuery<CodeMapOut>({
    queryKey: repositoryKeys.codeMap(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/code-map",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** (Re)generate the CodeCharta code-city map. Blocking. */
export function useGenerateCodeMapMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<CodeMapOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/code-map/run",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) =>
      queryClient.setQueryData(repositoryKeys.codeMap(id), data),
  });
}

/**
 * A tool's raw findings log (lint/SAST/dead-code/secret locations) for its latest run.
 * Fetched on demand (kept out of the analysis payload); resolves to a null log when the tool
 * hasn't run or produced nothing.
 */
export function useToolLogQuery(id: string, tool: string) {
  return useQuery<ToolLogOut>({
    queryKey: repositoryKeys.toolLog(id, tool),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/tools/{tool}/log",
        { params: { path: { repository_id: id, tool } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** Tool-ids of the integrations linked to a repository (the analysis allow-list). */
export function useRepoIntegrationsQuery(id: string) {
  return useQuery<string[]>({
    queryKey: repositoryKeys.integrations(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/repositories/{repository_id}/integrations",
        { params: { path: { repository_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

/** Link an integration to a repo (enables it; runs on next refresh / manual run). */
export function useLinkIntegrationMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tool: string): Promise<string[]> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/integrations/{tool_id}",
        { params: { path: { repository_id: id, tool_id: tool } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(repositoryKeys.integrations(id), data);
    },
  });
}

/** Unlink an integration and clear its contributed data from the analysis. */
export function useUnlinkIntegrationMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tool: string): Promise<string[]> => {
      const { data, error } = await api.DELETE(
        "/api/v1/repositories/{repository_id}/integrations/{tool_id}",
        { params: { path: { repository_id: id, tool_id: tool } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(repositoryKeys.integrations(id), data);
      // Unlink clears analysis data / viz artifacts — refetch everything under the repo.
      queryClient.invalidateQueries({ queryKey: repositoryKeys.detail(id) });
    },
  });
}

/** Run a single external tool against a repository. Returns fresh analysis. */
export function useRunToolMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tool: ToolName): Promise<AnalysisOut> => {
      const { data, error } = await api.POST(
        "/api/v1/repositories/{repository_id}/tools/{tool}/run",
        { params: { path: { repository_id: id, tool } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(repositoryKeys.analysis(id), data);
      queryClient.invalidateQueries({ queryKey: repositoryKeys.detail(id) });
    },
  });
}
