import {
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  GitBranchIcon,
  Loader2Icon,
  SparklesIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Markdown } from "@/components/shared/Markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRunDetailQuery } from "@/features/briefing/api";
import {
  type BranchOut,
  extractErrorMessage,
  type HobitRunOut,
} from "@/lib/api";
import { formatDateTime, formatNumber, formatTimeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useBranchesQuery,
  useRepoHobitRunsQuery,
  useRunRepoHobitMutation,
} from "../api";
import { FactCard } from "./FactCard";

/** The branching-strategy auditor, run from this tab's header. */
const BRANCHING_HOBIT_SLUG = "git-branching";

const STATUS_STYLES: Record<string, string> = {
  merged:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  stale:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  active: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/25",
};

function BranchStatusBadge({ branch }: { branch: BranchOut }) {
  const { t } = useTranslation();
  if (branch.status === "default") {
    return (
      <Badge variant="secondary">
        {t("repositories.view.branch_status_default")}
      </Badge>
    );
  }
  const label = t(`repositories.view.branch_status_${branch.status}`);
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px]", STATUS_STYLES[branch.status])}
    >
      {branch.status === "merged" && branch.squash_merged
        ? `${label} · ${t("repositories.view.branch_squash_hint")}`
        : label}
    </Badge>
  );
}

/**
 * The branching hobit's latest verdict, inline above the branch table: its headline plus the
 * full narrative on demand. The run itself is a normal hobit run, so it also lands in the Hobits
 * tab and the briefing feed.
 */
function BranchingVerdict({
  repoId,
  run,
}: {
  repoId: string;
  run: HobitRunOut;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: detail, isPending } = useRunDetailQuery(
    repoId,
    open ? run.id : "",
  );

  if (run.status === "queued") {
    return (
      <Card className="flex flex-row items-center gap-2 p-4 text-sm">
        <Loader2Icon className="size-4 animate-spin text-primary" />
        {t("repositories.view.branching.running")}
      </Card>
    );
  }

  return (
    <Card className="gap-0 p-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-start gap-2 px-5 py-3.5 text-left"
      >
        {open ? (
          <ChevronDownIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {run.headline ?? t("repositories.view.branching.no_headline")}
            </span>
            {run.tier ? (
              <Badge variant="secondary" className="text-[10px]">
                {run.tier}
              </Badge>
            ) : null}
            {run.status === "completed" ? null : (
              <Badge variant="destructive" className="text-[10px]">
                {run.status}
              </Badge>
            )}
          </span>
          <span className="block text-xs text-muted-foreground">
            {t("repositories.view.branching.verdict_of", {
              when: formatTimeAgo(run.finished_at ?? run.started_at),
            })}
          </span>
        </span>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-border px-5 py-4">
          {isPending || !detail ? (
            <Skeleton className="h-32 w-full" />
          ) : detail.narrative ? (
            <>
              {/* Rendered, not raw: the hobit writes Markdown for a human to read. The copy
                  button hands back the source, which is what you paste into a ticket or doc. */}
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => {
                    navigator.clipboard
                      .writeText(detail.narrative ?? "")
                      .then(() =>
                        toast.success(t("repositories.view.branching.copied")),
                      );
                  }}
                >
                  <CopyIcon className="size-3" />
                  {t("repositories.view.branching.copy")}
                </Button>
              </div>
              <Markdown>{detail.narrative}</Markdown>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {detail.error ?? t("repositories.view.branching.no_detail")}
            </p>
          )}
        </div>
      ) : null}
    </Card>
  );
}

export function BranchesPanel({ repoId }: { repoId: string }) {
  const { t } = useTranslation();
  const { data, isPending, isError, error } = useBranchesQuery(repoId);
  const { data: runs } = useRepoHobitRunsQuery(repoId);
  const { mutate: askHobit, isPending: asking } =
    useRunRepoHobitMutation(repoId);
  // Newest first from the API, so the first match is the current verdict.
  const branchingRun =
    runs?.find((run) => run.hobit_slug === BRANCHING_HOBIT_SLUG) ?? null;
  const auditing = asking || branchingRun?.status === "queued";

  if (isPending) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="p-6 text-sm text-destructive">
        {error ? extractErrorMessage(error) : t("repositories.view.load_error")}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <FactCard
          label={t("repositories.view.branches_facts_total")}
          value={formatNumber(data.total_branches)}
        />
        <FactCard
          label={t("repositories.view.branches_facts_merged")}
          value={formatNumber(data.merged_count)}
          sub={t("repositories.view.branches_facts_merged_sub")}
        />
        <FactCard
          label={t("repositories.view.branches_facts_stale")}
          value={formatNumber(data.stale_count)}
          sub={t("repositories.view.branches_facts_stale_sub", {
            days: data.stale_days,
          })}
        />
      </section>

      {branchingRun ? (
        <BranchingVerdict repoId={repoId} run={branchingRun} />
      ) : null}

      <Card className="overflow-hidden p-0">
        <CardHeader className="flex flex-col items-start justify-between gap-3 p-6 pb-0 sm:flex-row sm:items-center">
          <CardTitle>
            {t("repositories.view.branches_title")}
            {data.branches.length > 0 ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({data.branches.length})
              </span>
            ) : null}
          </CardTitle>
          <Button
            size="sm"
            variant={branchingRun ? "outline" : "default"}
            disabled={auditing}
            onClick={() =>
              askHobit(BRANCHING_HOBIT_SLUG, {
                onSuccess: () =>
                  toast.success(t("repositories.view.branching.toast")),
              })
            }
          >
            {auditing ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <SparklesIcon className="size-3.5" />
            )}
            {auditing
              ? t("repositories.view.branching.running")
              : branchingRun
                ? t("repositories.view.branching.ask_again")
                : t("repositories.view.branching.ask")}
          </Button>
        </CardHeader>
        <CardContent className="p-0 pt-4">
          {data.branches.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              {t("repositories.view.branches_empty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("repositories.view.branch_name")}</TableHead>
                  <TableHead>{t("repositories.view.branch_status")}</TableHead>
                  <TableHead>
                    {t("repositories.view.branch_last_activity")}
                  </TableHead>
                  <TableHead>{t("repositories.view.branch_author")}</TableHead>
                  <TableHead>
                    {t("repositories.view.branch_ahead_behind", {
                      branch: data.default_branch,
                    })}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.branches.map((branch) => (
                  <TableRow key={branch.name}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        <GitBranchIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        {branch.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <BranchStatusBadge branch={branch} />
                    </TableCell>
                    <TableCell
                      className="text-muted-foreground"
                      title={formatDateTime(branch.last_commit_at)}
                    >
                      {formatTimeAgo(branch.last_commit_at)}
                    </TableCell>
                    <TableCell
                      className="text-muted-foreground"
                      title={branch.author_email}
                    >
                      {branch.author_name || branch.author_email || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                      {branch.ahead == null || branch.behind == null
                        ? "—"
                        : `+${branch.ahead} / −${branch.behind}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          {t("repositories.view.branches_as_of", {
            when: formatTimeAgo(data.as_of),
          })}
          {data.fetched
            ? null
            : ` — ${t("repositories.view.branches_fetch_failed")}`}
        </p>
        {data.truncated ? (
          <p>{t("repositories.view.branches_truncated")}</p>
        ) : null}
        <p>{t("repositories.view.branches_squash_note")}</p>
      </div>
    </div>
  );
}
