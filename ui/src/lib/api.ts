export type RepositoryStatus =
  | "registered"
  | "cloning"
  | "analyzing"
  | "ready"
  | "failed";

export interface RepositoryOut {
  id: string;
  provider: string;
  owner: string;
  name: string;
  slug: string;
  url: string;
  default_branch: string;
  status: RepositoryStatus;
  last_analyzed_commit: string | null;
  last_analyzed_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnalysisFacts {
  first_commit_at: string | null;
  last_commit_at: string | null;
  age_days: number | null;
  commit_count: number | null;
  contributor_count: number | null;
  loc_total: number | null;
  primary_language: string | null;
  license_spdx: string | null;
  license_name: string | null;
  has_tests: boolean | null;
  dependency_count: number | null;
}

export interface Contributor {
  id: string;
  name: string;
  email: string;
  commits: number;
  first_commit_at: string | null;
  last_commit_at: string | null;
}

export interface CommitActivity {
  day: string; // YYYY-MM-DD
  count: number;
}

export interface LanguageStat {
  language: string;
  loc: number;
  files: number;
  pct: number;
}

export interface Dependency {
  ecosystem: string;
  name: string;
  version: string | null;
  manifest_file: string | null;
  is_dev: boolean;
}

export interface CICD {
  system: string;
  config_files: string[];
}

export interface Hotspot {
  path: string;
  churn: number;
  size: number;
  score: number;
}

export type Rating = "A" | "B" | "C" | "D" | "E" | "NA";

export interface EnrichmentRatings {
  maintainability: Rating;
  security: Rating;
  health: Rating;
}

export interface Enrichment {
  code_lines: number | null;
  complexity_total: number | null;
  cocomo_cost_usd: number | null;
  schedule_months: number | null;
  ccn_average: number | null;
  ccn_max: number | null;
  function_count: number | null;
  high_complexity_count: number | null;
  maintainability_index: number | null;
  sbom_package_count: number | null;
  vulnerability_count: number;
  vuln_critical: number;
  vuln_high: number;
  vuln_moderate: number;
  vuln_low: number;
  secret_count: number;
  health_score: number | null;
  ratings: EnrichmentRatings;
}

export interface Vulnerability {
  package: string;
  ecosystem: string;
  version: string | null;
  vuln_id: string;
  severity: string;
  fixed_version: string | null;
}

export interface HealthCheck {
  name: string;
  score: number;
  reason: string;
}

export interface ToolRun {
  name: string;
  available: boolean;
  contributed: boolean;
}

export interface AnalysisOut {
  id: string;
  repository_id: string;
  commit_sha: string;
  analyzed_at: string;
  facts: AnalysisFacts;
  contributors: Contributor[];
  commit_activity: CommitActivity[];
  languages: LanguageStat[];
  dependencies: Dependency[];
  cicd: CICD[];
  hotspots: Hotspot[];
  enrichment: Enrichment;
  vulnerabilities: Vulnerability[];
  health_checks: HealthCheck[];
  tool_runs: ToolRun[];
}

export interface ToolStatus {
  name: string;
  available: boolean;
  version: string | null;
  purpose: string;
  install: string;
  homepage: string;
}

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Thrown for non-OK HTTP responses. `status` is the HTTP status code. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.detail ?? body?.error ?? detail;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new ApiError(res.status, String(detail));
  }

  return (await res.json()) as T;
}

export function listRepositories(): Promise<RepositoryOut[]> {
  return request<RepositoryOut[]>("/repositories");
}

export function addRepository(url: string): Promise<RepositoryOut> {
  return request<RepositoryOut>("/repositories", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export function getRepository(id: string): Promise<RepositoryOut> {
  return request<RepositoryOut>(`/repositories/${id}`);
}

export function getAnalysis(id: string): Promise<AnalysisOut> {
  return request<AnalysisOut>(`/repositories/${id}/analysis`);
}

export function getTools(): Promise<ToolStatus[]> {
  return request<ToolStatus[]>("/tools");
}
