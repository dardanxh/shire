import { Link } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  FileWarningIcon,
  GitBranchIcon,
  Loader2Icon,
  SparklesIcon,
  TriangleAlertIcon,
  WandSparklesIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  CicdEnvironmentOut,
  CicdExecutionOut,
  CicdSuggestionOut,
} from "@/lib/api";
import { formatTimeAgo, shortSha } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useApplyCicdSuggestionsMutation,
  useCicdScanMutation,
  useCicdStatusQuery,
  useRunRepoHobitMutation,
} from "../api";
import { EnvFlowDiagram } from "./EnvFlowDiagram";

/**
 * The repo view's CI/CD tab. Three engines feed it: the deterministic filename scan (instant),
 * the structured engine scan behind the Scan button (environments, promotion flow, prose summary,
 * quick suggestions), and the `ci-cd` hobit's deeper efficiency audit — whose findings land in the
 * same suggestion list, tagged as hobit-sourced. A suggestion can then be implemented by the
 * engine on a fresh local `cicd/*` branch.
 */

const CICD_HOBIT_SLUG = "ci-cd";
/** A deploy branch nobody has touched in this long is worth flagging on the card. */
const STALE_ENV_DAYS = 30;

export function CicdPanel({ repoId }: { repoId: string }) {
  const { t } = useTranslation();
  const { data: status, isPending } = useCicdStatusQuery(repoId);
  const { mutate: scan, isPending: scanning } = useCicdScanMutation(repoId);
  const { mutate: runHobit, isPending: askingHobit } =
    useRunRepoHobitMutation(repoId);

  const scanPending = scanning || (status?.scan_pending ?? false);
  const hobitPending = askingHobit || (status?.hobit_pending ?? false);
  const analysis = status?.analysis ?? null;
  const detected = status?.detected_files ?? [];
  const suggestions = status?.suggestions ?? [];
  const proposed = suggestions.filter((s) => s.status === "proposed");
  const applied = suggestions.filter((s) => s.status === "applied");
  const executions = status?.executions ?? [];
  const running = executions.find((e) => e.status === "pending") ?? null;

  if (!isPending && detected.length === 0 && analysis === null) {
    return (
      <Card className="flex flex-col gap-3 border-warning/30 bg-warning/5 p-4 sm:flex-row sm:items-center">
        <FileWarningIcon className="size-5 shrink-0 text-warning" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium">
            {t("repositories.view.cicd.empty_title")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("repositories.view.cicd.empty_body")}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <CardTitle className="flex flex-wrap items-center gap-2">
            {t("repositories.view.cicd.title")}
            {(status?.platforms ?? []).map((platform) => (
              <Badge key={platform} variant="secondary" className="text-[10px]">
                {t(`repositories.view.cicd.platform_${platform}`, {
                  defaultValue: platform,
                })}
              </Badge>
            ))}
            {detected.length > 0 ? (
              <span className="text-sm font-normal text-muted-foreground">
                {t("repositories.view.cicd.file_count", {
                  count: detected.length,
                })}
              </span>
            ) : null}
          </CardTitle>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={analysis ? "outline" : "default"}
              disabled={scanPending}
              onClick={() =>
                scan(undefined, {
                  onSuccess: () =>
                    toast.success(t("repositories.view.cicd.scan_toast")),
                })
              }
            >
              {scanPending ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <SparklesIcon className="size-3.5" />
              )}
              {scanPending
                ? t("repositories.view.cicd.scanning")
                : analysis
                  ? t("repositories.view.cicd.rescan")
                  : t("repositories.view.cicd.scan")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={hobitPending}
              onClick={() =>
                runHobit(CICD_HOBIT_SLUG, {
                  onSuccess: () =>
                    toast.success(t("repositories.view.cicd.hobit_toast")),
                })
              }
            >
              {hobitPending ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <SparklesIcon className="size-3.5" />
              )}
              {hobitPending
                ? t("repositories.view.cicd.hobit_running")
                : t("repositories.view.cicd.ask_hobit")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {analysis ? (
            <>
              <p className="text-sm leading-relaxed">{analysis.summary}</p>
              <p className="text-xs text-muted-foreground">
                {t("repositories.view.cicd.generated", {
                  when: formatTimeAgo(analysis.generated_at),
                })}
                {analysis.commit_sha
                  ? ` · ${shortSha(analysis.commit_sha)}`
                  : ""}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {isPending
                ? t("repositories.view.cicd.loading")
                : t("repositories.view.cicd.not_scanned")}
            </p>
          )}
          {detected.length > 0 ? (
            <p className="truncate font-mono text-xs text-muted-foreground">
              {detected
                .slice(0, 8)
                .map((file) => file.path)
                .join(" · ")}
              {detected.length > 8 ? " …" : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {analysis && analysis.environments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("repositories.view.cicd.environments")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {analysis.environments.map((env) => (
              <EnvironmentCard key={env.key} env={env} />
            ))}
          </CardContent>
        </Card>
      ) : null}

      {analysis && analysis.transitions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("repositories.view.cicd.flow")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="pb-3 text-xs text-muted-foreground">
              {t("repositories.view.cicd.flow_hint")}
            </p>
            <EnvFlowDiagram
              environments={analysis.environments}
              transitions={analysis.transitions}
            />
          </CardContent>
        </Card>
      ) : null}

      {status?.hobit_run ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {t("repositories.view.cicd.hobit_verdict")}
              {status.hobit_run.tier ? (
                <Badge variant="secondary" className="text-[10px]">
                  {status.hobit_run.tier}
                </Badge>
              ) : null}
            </CardTitle>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatTimeAgo(status.hobit_run.finished_at)}
            </span>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">
              {status.hobit_run.headline ??
                t("repositories.view.cicd.hobit_no_headline")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("repositories.view.cicd.hobit_where")}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {suggestions.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-sm font-medium">
              {t("repositories.view.cicd.suggestions")}
            </h3>
            <span className="text-xs text-muted-foreground">
              {t("repositories.view.cicd.suggestion_count", {
                count: proposed.length,
              })}
            </span>
          </div>
          {running ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
              <Loader2Icon className="size-4 animate-spin text-primary" />
              {t("repositories.view.cicd.implementing")}
              <span className="font-mono text-xs">{running.branch}</span>
              {running.job_id ? (
                <Link
                  to="/jobs/$id"
                  params={{ id: running.job_id }}
                  className="text-xs underline hover:text-foreground"
                >
                  {t("repositories.view.cicd.view_job")}
                </Link>
              ) : null}
            </div>
          ) : null}
          {[...proposed, ...applied].map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              repoId={repoId}
              suggestion={suggestion}
              execution={
                executions.find((e) => e.id === suggestion.execution_id) ?? null
              }
              blocked={running !== null}
            />
          ))}
        </div>
      ) : null}

      {executions.some((e) => e.status === "failed") ? (
        <Card className="border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-medium">
            {t("repositories.view.cicd.execution_failed")}
          </p>
          <p className="text-xs text-muted-foreground">
            {executions.find((e) => e.status === "failed")?.error}
          </p>
        </Card>
      ) : null}
    </div>
  );
}

const KIND_STYLES: Record<string, string> = {
  prod: "border-red-500/30 bg-red-500/5",
  staging: "border-amber-500/30 bg-amber-500/5",
  qa: "border-sky-500/30 bg-sky-500/5",
  dev: "border-emerald-500/30 bg-emerald-500/5",
  preview: "border-violet-500/30 bg-violet-500/5",
};

function EnvironmentCard({ env }: { env: CicdEnvironmentOut }) {
  const { t } = useTranslation();
  const stale =
    env.last_commit_at != null &&
    Date.now() - new Date(env.last_commit_at).getTime() >
      STALE_ENV_DAYS * 86_400_000;
  const gone = env.branch !== "" && env.branch_exists === false;

  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border p-3",
        KIND_STYLES[env.kind] ?? "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{env.name}</span>
        <Badge variant="outline" className="text-[10px] capitalize">
          {env.kind}
        </Badge>
        {env.auto_deploy ? (
          <Badge variant="secondary" className="text-[10px]">
            {t("repositories.view.cicd.auto")}
          </Badge>
        ) : null}
      </div>
      {env.branch ? (
        <p className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <GitBranchIcon className="size-3 shrink-0" />
          {env.branch}
        </p>
      ) : null}
      <dl className="space-y-1 text-xs">
        {env.deploy_target ? (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">
              {t("repositories.view.cicd.deploys_to")}
            </dt>
            <dd className="min-w-0">{env.deploy_target}</dd>
          </div>
        ) : null}
        {env.trigger ? (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">
              {t("repositories.view.cicd.trigger")}
            </dt>
            <dd className="min-w-0">{env.trigger}</dd>
          </div>
        ) : null}
        {env.gates.length > 0 ? (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">
              {t("repositories.view.cicd.gates")}
            </dt>
            <dd className="min-w-0">{env.gates.join(", ")}</dd>
          </div>
        ) : null}
      </dl>
      {/* Live git facts — the config says what should happen, these say what actually has. */}
      {gone ? (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <TriangleAlertIcon className="size-3 shrink-0" />
          {t("repositories.view.cicd.branch_gone")}
        </p>
      ) : env.last_commit_at ? (
        <p
          className={cn(
            "text-xs",
            stale ? "text-warning" : "text-muted-foreground",
          )}
        >
          {t("repositories.view.cicd.last_commit", {
            when: formatTimeAgo(env.last_commit_at),
            who: env.last_commit_author ?? "—",
          })}
          {env.behind != null && env.behind > 0
            ? ` · ${t("repositories.view.cicd.behind", { count: env.behind })}`
            : ""}
        </p>
      ) : null}
      {env.notes ? (
        <p className="text-xs text-muted-foreground">{env.notes}</p>
      ) : null}
      {env.source_file ? (
        <p className="truncate font-mono text-[10px] text-muted-foreground">
          {env.source_file}
        </p>
      ) : null}
    </div>
  );
}

const IMPACT_STYLES: Record<string, string> = {
  high: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25",
  medium:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  low: "bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/25",
};

function SuggestionCard({
  repoId,
  suggestion,
  execution,
  blocked,
}: {
  repoId: string;
  suggestion: CicdSuggestionOut;
  execution: CicdExecutionOut | null;
  blocked: boolean;
}) {
  const { t } = useTranslation();
  // Collapsed by default — the section is a scannable list of opportunities.
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { mutate: implement, isPending } =
    useApplyCicdSuggestionsMutation(repoId);
  const isApplied = suggestion.status === "applied";

  return (
    <Card className={cn("gap-0 p-0", isApplied && "opacity-70")}>
      <div className="flex items-start justify-between gap-2 px-5 py-3.5">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          {open ? (
            <ChevronDownIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 space-y-1">
            <span className="flex flex-wrap items-center gap-2">
              {isApplied ? (
                <CircleCheckIcon className="size-3.5 shrink-0 text-success" />
              ) : null}
              <span className="font-medium">{suggestion.title}</span>
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px]",
                  IMPACT_STYLES[suggestion.impact] ?? "",
                )}
              >
                {t(`repositories.view.cicd.impact_${suggestion.impact}`, {
                  defaultValue: suggestion.impact,
                })}
              </Badge>
              <Badge variant="secondary" className="text-[10px] capitalize">
                {suggestion.category}
              </Badge>
              {suggestion.source === "hobit" ? (
                <Badge variant="outline" className="text-[10px]">
                  {t("repositories.view.cicd.from_hobit")}
                </Badge>
              ) : null}
            </span>
          </span>
        </button>
      </div>

      {open ? (
        <div className="space-y-3 border-t border-border px-5 py-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {suggestion.detail}
          </p>
          {suggestion.paths.length > 0 ? (
            <p className="flex flex-wrap gap-2 font-mono text-xs text-muted-foreground">
              {suggestion.paths.map((path) => (
                <span key={path}>{path}</span>
              ))}
            </p>
          ) : null}

          {isApplied ? (
            <div className="space-y-1 rounded-md border border-border p-3 text-xs">
              <p className="font-medium">
                {t("repositories.view.cicd.implemented")}
              </p>
              {execution ? (
                <>
                  <p className="font-mono text-muted-foreground">
                    {execution.branch}
                    {execution.commit_sha
                      ? ` · ${shortSha(execution.commit_sha)}`
                      : ""}
                  </p>
                  {execution.agent_summary ? (
                    <p className="text-muted-foreground">
                      {execution.agent_summary}
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : confirming ? (
            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">
                {t("repositories.view.cicd.implement_confirm")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() => {
                    setConfirming(false);
                    implement([suggestion.id], {
                      onSuccess: () =>
                        toast.success(
                          t("repositories.view.cicd.implement_toast"),
                        ),
                    });
                  }}
                >
                  <WandSparklesIcon className="size-3.5" />
                  {t("repositories.view.cicd.implement_go")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirming(false)}
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={blocked || isPending}
              onClick={() => setConfirming(true)}
            >
              <WandSparklesIcon className="size-3.5" />
              {t("repositories.view.cicd.implement")}
            </Button>
          )}
        </div>
      ) : null}
    </Card>
  );
}
