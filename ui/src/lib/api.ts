import createClient from "openapi-fetch";
import type { components, paths } from "@/lib/api-types.gen";
import { env } from "@/lib/env";

/**
 * openapi-fetch client. The backend serves under `/api/v1` and the generated
 * paths already include that prefix, so the base URL is empty (same-origin).
 * The Vite dev proxy forwards `/api/* → :8000` verbatim (see vite.config.ts),
 * so we call paths as generated: `api.GET("/api/v1/repositories")`.
 *
 * No auth shim: the hobits backend has no per-request auth headers.
 */
export const api = createClient<paths>({ baseUrl: env.VITE_API_BASE_URL });

// ---- Domain types (source of truth: generated `api-types.gen.ts`) ----------
// The backend result schemas are `*Result`; we keep the shorter `*Out` alias
// names on the frontend so feature code stays stable.
export type RepositoryOut = components["schemas"]["RepositoryResult"];
export type AnalysisOut = components["schemas"]["AnalysisResult"];
export type RepoContextOut = components["schemas"]["RepoContextResult"];
export type ContextMarkdownOut = components["schemas"]["ContextMarkdownResult"];
export type HobitOut = components["schemas"]["HobitResult"];
export type HobitConfigUpdate = components["schemas"]["HobitConfigUpdate"];
/** Create/edit body for a user-authored hobit (create and edit share the same shape). */
export type HobitInput = components["schemas"]["CreateHobit"];
export type HobitRunOut = components["schemas"]["HobitRunResult"];
export type HobitRunDetailOut = components["schemas"]["HobitRunDetailResult"];
export type HobitRunFeedbackOut =
  components["schemas"]["HobitRunFeedbackResult"];
export type HobitGuidanceOut = components["schemas"]["HobitGuidanceResult"];
export type BriefingItemOut = components["schemas"]["BriefingItemResult"];
export type GraphOut = components["schemas"]["GraphResult"];
export type CodeAgeOut = components["schemas"]["CodeAgeResult"];
export type CouplingOut = components["schemas"]["CouplingResult"];
export type CouplingPair = components["schemas"]["CouplingPair"];
export type DependencyFreshnessOut =
  components["schemas"]["DependencyFreshnessResult"];
export type DependencyFreshnessItem =
  components["schemas"]["DependencyFreshnessItem"];
export type ArchitectureOut = components["schemas"]["ArchitectureResult"];
export type ArchitectureDiagram = components["schemas"]["ArchitectureDiagram"];
export type CodebaseOverviewOut =
  components["schemas"]["CodebaseOverviewResult"];
export type CodeMapOut = components["schemas"]["CodeMapResult"];
export type ToolStatusOut = components["schemas"]["ToolStatusResult"];
export type ToolLogOut = components["schemas"]["ToolLogResult"];
export type RepositoriesPage = components["schemas"]["Page_RepositoryResult_"];
export type BranchesOut = components["schemas"]["BranchesResult"];
export type BranchOut = components["schemas"]["BranchResult"];
export type BranchNamesOut = components["schemas"]["BranchNamesResult"];
export type MergeReviewOut = components["schemas"]["MergeReviewResult"];
export type MergeReviewDetailOut =
  components["schemas"]["MergeReviewDetailResult"];
export type MergeReviewsPage = components["schemas"]["Page_MergeReviewResult_"];
export type MergeReviewFootprint = components["schemas"]["Footprint"];
export type FileFootprintOut = components["schemas"]["FileFootprint"];
export type DirectoryFootprintOut = components["schemas"]["DirectoryFootprint"];
export type MrHobitReviewOut = components["schemas"]["MrHobitReviewResult"];
export type MrCommentOut = components["schemas"]["MrComment"];
export type TopFindingOut = components["schemas"]["TopFindingResult"];
export type RiskBreakdownOut = components["schemas"]["RiskBreakdown"];
export type ClassificationLabelOut =
  components["schemas"]["ClassificationLabel"];
export type JobOut = components["schemas"]["JobResult"];
export type JobDetailOut = components["schemas"]["JobDetailResult"];
export type JobUsageOut = components["schemas"]["JobUsage"];
export type EngineConfigOut = components["schemas"]["EngineConfigResult"];
export type UpdateEngineConfigIn = components["schemas"]["UpdateEngineConfig"];
export type JobStatsOut = components["schemas"]["JobStatsResult"];
export type QuestionOut = components["schemas"]["QuestionResult"];
export type PrincipleOut = components["schemas"]["PrincipleResult"];
export type PrincipleCheckOut = components["schemas"]["PrincipleCheckResult"];
export type RepoPrincipleStatusOut =
  components["schemas"]["RepoPrincipleStatusResult"];
export type PrincipleIn = components["schemas"]["CreatePrinciple"];
export type NewsTopicOut = components["schemas"]["NewsTopicResult"];
export type NewsSourceOut = components["schemas"]["NewsSourceResult"];
export type NewsItemOut = components["schemas"]["NewsItemResult"];
export type NewsItemsPage = components["schemas"]["Page_NewsItemResult_"];
export type NewsPollOut = components["schemas"]["NewsPollResult"];
export type NewsRecommendationOut =
  components["schemas"]["NewsRecommendationResult"];
export type NewsConfigOut = components["schemas"]["NewsConfigResult"];
export type NewsTopicIn = components["schemas"]["CreateNewsTopic"];
export type NewsSourceIn = components["schemas"]["CreateNewsSource"];
export type UpdateNewsConfigIn = components["schemas"]["UpdateNewsConfig"];
export type RoadmapOut = components["schemas"]["RoadmapResult"];
export type RoadmapsPage = components["schemas"]["Page_RoadmapResult_"];
export type RoadmapDetailOut = components["schemas"]["RoadmapDetailResult"];
export type RoadmapItemOut = components["schemas"]["RoadmapItemResult"];
export type RoadmapMilestoneOut =
  components["schemas"]["RoadmapMilestoneResult"];
export type RoadmapVersionOut = components["schemas"]["RoadmapVersionResult"];
export type RoadmapRepoRefOut = components["schemas"]["RoadmapRepoRef"];
export type RepoAssessmentOut = components["schemas"]["RepoAssessmentResult"];
export type RoadmapIn = components["schemas"]["CreateRoadmap"];
export type UpdateRoadmapItemIn = components["schemas"]["UpdateRoadmapItem"];
export type RoadmapBurnupOut = components["schemas"]["BurnupResult"];
export type RoadmapRadarOut = components["schemas"]["RadarResult"];
export type RoadmapExecutionOut =
  components["schemas"]["RoadmapExecutionResult"];
export type RefreshPrsOut = components["schemas"]["RefreshPrsResult"];
export type RoadmapDriftStatusOut =
  components["schemas"]["RoadmapDriftStatusResult"];
export type RoadmapDriftCheckOut =
  components["schemas"]["RoadmapDriftCheckResult"];
export type RoadmapDriftFindingOut =
  components["schemas"]["RoadmapDriftFindingResult"];
export type ExportIssuesOut = components["schemas"]["ExportIssuesResult"];
export type RepoRoadmapSliceOut =
  components["schemas"]["RepoRoadmapSliceResult"];
export type HomeStatusOut = components["schemas"]["HomeStatusResult"];
export type CouncilTopicOut = components["schemas"]["CouncilTopicResult"];
export type CouncilTopicDetailOut =
  components["schemas"]["CouncilTopicDetailResult"];
export type CouncilTakeOut = components["schemas"]["CouncilTakeResult"];
export type CouncilTopicsPage =
  components["schemas"]["Page_CouncilTopicResult_"];

/** Roadmap item labels (backend types the column as a bare string). */
export const ROADMAP_ITEM_LABELS = [
  "improvement",
  "fix",
  "refactor",
  "feature",
  "security",
  "deprecation",
  "lib_upgrade",
  "docs",
  "testing",
  "performance",
] as const;
export type RoadmapItemLabel = (typeof ROADMAP_ITEM_LABELS)[number];

/** Roadmap item lifecycle statuses (backend types the column as a bare string). */
export const ROADMAP_ITEM_STATUSES = ["todo", "in_progress", "done"] as const;
export type RoadmapItemStatus = (typeof ROADMAP_ITEM_STATUSES)[number];

/** Effort sizes for roadmap items. */
export const ROADMAP_EFFORTS = ["S", "M", "L", "XL"] as const;
export type RoadmapEffort = (typeof ROADMAP_EFFORTS)[number];

/** Eisenhower quadrants, derived server-side from `urgent` × `important`. */
export const ROADMAP_QUADRANTS = [
  "do_first",
  "schedule",
  "delegate",
  "later",
] as const;
export type RoadmapQuadrant = (typeof ROADMAP_QUADRANTS)[number];

/** Principle severities (backend types the column as a bare string). */
export const PRINCIPLE_SEVERITIES = ["info", "warning", "critical"] as const;

/** Job lifecycle statuses (backend types the column as a bare string). */
export const JOB_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export type JobsPage = components["schemas"]["Page_JobResult_"];
export type ConnectionOut = components["schemas"]["ConnectionResult"];
export type ConnectionsPage = components["schemas"]["Page_ConnectionResult_"];
export type TestConnectionOut = components["schemas"]["TestConnectionResult"];

/** Sources you can connect. The first three hold credentials; "local" points at an on-disk repo
 * (absolute path, analyzed in place — no credentials). */
export const CONNECTION_PROVIDERS = [
  "github",
  "gitlab",
  "bitbucket",
  "local",
] as const;
export type ConnectionProvider = (typeof CONNECTION_PROVIDERS)[number];

/** How a connection authenticates. */
export const CONNECTION_AUTH_METHODS = ["token", "basic"] as const;
export type ConnectionAuthMethod = (typeof CONNECTION_AUTH_METHODS)[number];
export type ToolRun = components["schemas"]["ToolRun"];
export type Enrichment = components["schemas"]["Enrichment"];
export type Ratings = components["schemas"]["Ratings"];
export type Rating = components["schemas"]["Rating"];
export type Vulnerability = components["schemas"]["Vulnerability"];
export type HealthCheck = components["schemas"]["HealthCheck"];
export type Hotspot = components["schemas"]["Hotspot"];
export type LanguageStat = components["schemas"]["LanguageStat"];
export type Dependency = components["schemas"]["Dependency"];
export type Contributor = components["schemas"]["Contributor"];
export type Facts = components["schemas"]["FactsResult"];
export type CommitActivity = components["schemas"]["DailyCommitCount"];
export type CiCdConfig = components["schemas"]["CiCdConfig"];
export type MembersOverviewOut = components["schemas"]["MembersOverviewResult"];
export type MemberSummaryOut = components["schemas"]["MemberSummaryResult"];
export type PortfolioHealthOut = components["schemas"]["PortfolioHealthResult"];
export type MemberDetailOut = components["schemas"]["MemberDetailResult"];
export type MemberRepositoryBreakdownOut =
  components["schemas"]["MemberRepositoryBreakdownResult"];
export type MemberExclusionOut = components["schemas"]["MemberExclusionResult"];

/** Repository lifecycle status (backend types it as a bare string). */
export type RepositoryStatus =
  | "registered"
  | "cloning"
  | "analyzing"
  | "ready"
  | "failed";

/** External tools that can be run on-demand against a repository. */
export const TOOL_NAMES = [
  "scc",
  "lizard",
  "radon",
  "syft",
  "osv-scanner",
  "gitleaks",
  "scorecard",
  "test-metrics",
  "ruff",
  "bandit",
  "vulture",
  "ownership",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

/**
 * Pull the BE `detail` out of an error thrown by a feature hook. Handles the
 * FastAPI exception-handler shapes:
 *  - `{ detail: string }` — AppError / HTTPException.
 *  - `{ detail: Array<{ msg }> }` — 422 validation errors (joined).
 *  - native `Error` — falls through to `err.message`.
 *  - anything else — a generic fallback.
 */
export function extractErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "detail" in err) {
    const detail = (err as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const msgs = detail
        .map((d) =>
          d && typeof d === "object" && "msg" in d
            ? String((d as { msg: unknown }).msg)
            : String(d),
        )
        .filter(Boolean);
      if (msgs.length) return msgs.join("; ");
    }
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}
