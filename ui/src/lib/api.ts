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
export type ToolStatusOut = components["schemas"]["ToolStatusResult"];
export type RepositoriesPage = components["schemas"]["Page_RepositoryResult_"];
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
