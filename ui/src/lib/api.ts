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
export type HobitRunOut = components["schemas"]["HobitRunResult"];
export type HobitRunDetailOut = components["schemas"]["HobitRunDetailResult"];
export type BriefingItemOut = components["schemas"]["BriefingItemResult"];
export type GraphOut = components["schemas"]["GraphResult"];
export type CodeAgeOut = components["schemas"]["CodeAgeResult"];
export type CouplingOut = components["schemas"]["CouplingResult"];
export type CouplingPair = components["schemas"]["CouplingPair"];
export type DependencyFreshnessOut =
  components["schemas"]["DependencyFreshnessResult"];
export type DependencyFreshnessItem =
  components["schemas"]["DependencyFreshnessItem"];
export type CodeMapOut = components["schemas"]["CodeMapResult"];
export type ToolStatusOut = components["schemas"]["ToolStatusResult"];
export type ToolLogOut = components["schemas"]["ToolLogResult"];
export type RepositoriesPage = components["schemas"]["Page_RepositoryResult_"];
export type ConnectionOut = components["schemas"]["ConnectionResult"];
export type ConnectionsPage = components["schemas"]["Page_ConnectionResult_"];
export type TestConnectionOut = components["schemas"]["TestConnectionResult"];

/** Git providers that support credential connections. */
export const CONNECTION_PROVIDERS = ["github", "gitlab", "bitbucket"] as const;
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
