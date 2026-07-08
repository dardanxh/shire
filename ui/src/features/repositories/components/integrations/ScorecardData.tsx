import { DownloadIcon, KeyRoundIcon, ShieldCheckIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AnalysisOut } from "@/lib/api";
import { formatNumber, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useToolLogQuery } from "../../api";
import { FactCard } from "../FactCard";
import { LanguageBars } from "../LanguageBars";
import { RatingBadge } from "../RatingBadge";
import { VulnerabilitiesTable } from "../VulnerabilitiesTable";

/**
 * Renders a scorecard tool's own contributed data inline in its integration
 * view — so each integration is self-contained rather than pointing at another
 * tab. Keyed by tool id; unknown ids render nothing (the shell still shows the
 * run trigger + status).
 */
/** Tools whose findings we persist as a downloadable log (issue producers). */
const LOG_TOOLS = new Set([
  "ruff",
  "bandit",
  "vulture",
  "gitleaks",
  "osv-scanner",
]);

export function ScorecardData({
  repoId,
  toolId,
  analysis,
}: {
  repoId: string;
  toolId: string;
  analysis: AnalysisOut;
}) {
  const body = renderToolData(toolId, analysis);
  const hasLog = LOG_TOOLS.has(toolId);
  if (!body && !hasLog) return null;
  return (
    <div className="space-y-4">
      {body}
      {hasLog ? <ToolLog repoId={repoId} toolId={toolId} /> : null}
    </div>
  );
}

function renderToolData(toolId: string, analysis: AnalysisOut) {
  switch (toolId) {
    case "scc":
      return <SccData analysis={analysis} />;
    case "lizard":
      return <LizardData analysis={analysis} />;
    case "radon":
      return <RadonData analysis={analysis} />;
    case "syft":
      return <SyftData analysis={analysis} />;
    case "osv-scanner":
      return <OsvData analysis={analysis} />;
    case "gitleaks":
      return <GitleaksData analysis={analysis} />;
    case "scorecard":
      return <ScorecardHealthData analysis={analysis} />;
    case "test-metrics":
      return <TestMetricsData analysis={analysis} />;
    case "ruff":
      return <RuffData analysis={analysis} />;
    case "bandit":
      return <BanditData analysis={analysis} />;
    case "vulture":
      return <VultureData analysis={analysis} />;
    case "ownership":
      return <OwnershipData analysis={analysis} />;
    default:
      return null;
  }
}

/** Scrollable findings log for issue-producing tools, with a download button. */
function ToolLog({ repoId, toolId }: { repoId: string; toolId: string }) {
  const { t } = useTranslation();
  const { data, isPending } = useToolLogQuery(repoId, toolId);
  const log = data?.log;
  if (isPending || !log) return null;

  const handleDownload = () => {
    const blob = new Blob([log], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${toolId}-findings.log`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {t("repositories.integrations.log.title", {
            count: data.line_count,
          })}
        </p>
        <Button size="sm" variant="outline" onClick={handleDownload}>
          <DownloadIcon className="size-3.5" />
          {t("repositories.integrations.log.download")}
        </Button>
      </div>
      <pre className="max-h-96 overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed whitespace-pre">
        {log}
      </pre>
    </div>
  );
}

/** Whether we have a bespoke data view for a given scorecard tool id. */
export const SCORECARD_DATA_IDS = new Set([
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
]);

type DataProps = { analysis: AnalysisOut };

function dash(n: number | null | undefined): string {
  return n == null ? "—" : formatNumber(n);
}

function Facts({ children }: { children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {children}
    </section>
  );
}

// scc — size & cost: LOC, code lines, COCOMO estimate, language breakdown.
function SccData({ analysis }: DataProps) {
  const { t } = useTranslation();
  const e = analysis.enrichment;
  const f = analysis.facts;
  return (
    <div className="space-y-4">
      <Facts>
        <FactCard
          label={t("repositories.view.facts.loc")}
          value={formatNumber(f.loc_total)}
        />
        <FactCard
          label={t("repositories.integrations.data.code_lines")}
          value={dash(e.code_lines)}
        />
        <FactCard
          label={t("repositories.view.enrichment.cost")}
          value={formatUsd(e.cocomo_cost_usd)}
          sub={
            e.schedule_months == null
              ? undefined
              : t("repositories.view.enrichment.cost_sub", {
                  months: Math.round(e.schedule_months),
                })
          }
        />
        <FactCard
          label={t("repositories.integrations.data.primary_language")}
          value={f.primary_language ?? "—"}
        />
      </Facts>
      <LanguageBars languages={analysis.languages} />
    </div>
  );
}

// lizard — cyclomatic complexity metrics.
function LizardData({ analysis }: DataProps) {
  const { t } = useTranslation();
  const e = analysis.enrichment;
  return (
    <Facts>
      <FactCard
        label={t("repositories.view.enrichment.complexity")}
        value={e.ccn_average == null ? "—" : e.ccn_average.toFixed(1)}
      />
      <FactCard
        label={t("repositories.integrations.data.ccn_max")}
        value={dash(e.ccn_max)}
      />
      <FactCard
        label={t("repositories.integrations.data.functions")}
        value={dash(e.function_count)}
      />
      <FactCard
        label={t("repositories.integrations.data.high_complexity")}
        value={dash(e.high_complexity_count)}
      />
    </Facts>
  );
}

// radon — Python maintainability index.
function RadonData({ analysis }: DataProps) {
  const { t } = useTranslation();
  const e = analysis.enrichment;
  return (
    <Facts>
      <FactCard
        label={t("repositories.view.enrichment.maintainability_index")}
        value={
          e.maintainability_index == null
            ? "—"
            : t("repositories.view.enrichment.maintainability_value", {
                value: Math.round(e.maintainability_index),
              })
        }
      />
    </Facts>
  );
}

// syft — SBOM package + dependency counts.
function SyftData({ analysis }: DataProps) {
  const { t } = useTranslation();
  const e = analysis.enrichment;
  const f = analysis.facts;
  return (
    <Facts>
      <FactCard
        label={t("repositories.view.enrichment.sbom")}
        value={dash(e.sbom_package_count)}
      />
      <FactCard
        label={t("repositories.view.facts.dependencies")}
        value={formatNumber(f.dependency_count)}
      />
    </Facts>
  );
}

// osv-scanner — known vulnerabilities.
function OsvData({ analysis }: DataProps) {
  const { t } = useTranslation();
  if (analysis.vulnerabilities.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
        {t("repositories.view.vulns_none")}
      </p>
    );
  }
  return <VulnerabilitiesTable vulnerabilities={analysis.vulnerabilities} />;
}

// gitleaks — detected secrets.
function GitleaksData({ analysis }: DataProps) {
  const { t } = useTranslation();
  const count = analysis.enrichment.secret_count;
  if (count > 0) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        <KeyRoundIcon className="size-5 shrink-0" />
        <span>{t("repositories.view.secrets.detected", { count })}</span>
      </div>
    );
  }
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <ShieldCheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
      {t("repositories.view.secrets.none")}
    </p>
  );
}

// scorecard — ratings + OpenSSF health checks.
function ScorecardHealthData({ analysis }: DataProps) {
  const { t } = useTranslation();
  const r = analysis.enrichment.ratings;
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <RatingBadge
          label={t("repositories.view.ratings.maintainability")}
          rating={r?.maintainability ?? "NA"}
        />
        <RatingBadge
          label={t("repositories.view.ratings.security")}
          rating={r?.security ?? "NA"}
        />
        <RatingBadge
          label={t("repositories.view.ratings.health")}
          rating={r?.health ?? "NA"}
        />
      </section>
      {analysis.health_checks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("repositories.view.health_empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {analysis.health_checks.map((h) => (
            <li key={h.name} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">{h.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {t("repositories.view.health_score", { score: h.score })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{h.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function pct(n: number | null | undefined, scale = 1): string {
  return n == null ? "—" : `${Math.round(n * scale)}%`;
}

const STATUS_STYLES: Record<string, string> = {
  active:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  dormant:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  abandoned: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25",
};

// test-metrics — testing (deterministic scanner).
function TestMetricsData({ analysis }: DataProps) {
  const { t } = useTranslation();
  const e = analysis.enrichment;
  return (
    <Facts>
      <FactCard
        label={t("repositories.integrations.data.tests")}
        value={dash(e.test_count)}
      />
      <FactCard
        label={t("repositories.integrations.data.test_files")}
        value={dash(e.test_file_count)}
      />
      <FactCard
        label={t("repositories.integrations.data.coverage")}
        value={pct(e.test_coverage_pct)}
      />
      <FactCard
        label={t("repositories.integrations.data.test_ratio")}
        value={pct(e.test_to_code_ratio, 100)}
      />
      <FactCard
        label={t("repositories.integrations.data.assertion_density")}
        value={
          e.assertion_density == null ? "—" : e.assertion_density.toFixed(1)
        }
      />
      <FactCard
        label={t("repositories.integrations.data.frameworks")}
        value={e.test_frameworks ?? "—"}
      />
    </Facts>
  );
}

// ruff — Python lint.
function RuffData({ analysis }: DataProps) {
  const { t } = useTranslation();
  return (
    <Facts>
      <FactCard
        label={t("repositories.integrations.data.lint_issues")}
        value={dash(analysis.enrichment.lint_issue_count)}
      />
    </Facts>
  );
}

// bandit — Python SAST by severity.
function BanditData({ analysis }: DataProps) {
  const { t } = useTranslation();
  const e = analysis.enrichment;
  return (
    <Facts>
      <FactCard
        label={t("repositories.integrations.data.sast_issues")}
        value={dash(e.sast_issue_count)}
      />
      <FactCard
        label={t("repositories.integrations.data.sast_high")}
        value={dash(e.sast_high)}
      />
      <FactCard
        label={t("repositories.integrations.data.sast_medium")}
        value={dash(e.sast_medium)}
      />
      <FactCard
        label={t("repositories.integrations.data.sast_low")}
        value={dash(e.sast_low)}
      />
    </Facts>
  );
}

// vulture — dead Python code.
function VultureData({ analysis }: DataProps) {
  const { t } = useTranslation();
  return (
    <Facts>
      <FactCard
        label={t("repositories.integrations.data.dead_code")}
        value={dash(analysis.enrichment.dead_code_count)}
      />
    </Facts>
  );
}

// ownership — people & maintenance (git history).
function OwnershipData({ analysis }: DataProps) {
  const { t } = useTranslation();
  const e = analysis.enrichment;
  const status = e.maintenance_status;
  return (
    <Facts>
      <FactCard
        label={t("repositories.integrations.data.bus_factor")}
        value={dash(e.bus_factor)}
      />
      <FactCard
        label={t("repositories.integrations.data.top_author_share")}
        value={pct(e.top_author_share, 100)}
      />
      <FactCard
        label={t("repositories.integrations.data.active_contributors")}
        value={dash(e.active_contributor_count)}
      />
      <FactCard
        label={t("repositories.integrations.data.commits_90d")}
        value={dash(e.commits_last_90d)}
      />
      <FactCard
        label={t("repositories.integrations.data.last_commit")}
        value={
          e.days_since_last_commit == null
            ? "—"
            : t("repositories.integrations.data.days_ago", {
                count: e.days_since_last_commit,
              })
        }
      />
      <FactCard
        label={t("repositories.integrations.data.status")}
        value={
          status ? (
            <Badge
              variant="outline"
              className={cn("capitalize", STATUS_STYLES[status])}
            >
              {t(`repositories.integrations.data.status_${status}`, {
                defaultValue: status,
              })}
            </Badge>
          ) : (
            "—"
          )
        }
      />
    </Facts>
  );
}
