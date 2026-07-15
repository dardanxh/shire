import { GitBranchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
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
import { type BranchOut, extractErrorMessage } from "@/lib/api";
import { formatDateTime, formatNumber, formatTimeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useBranchesQuery } from "../api";
import { FactCard } from "./FactCard";

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

export function BranchesPanel({ repoId }: { repoId: string }) {
  const { t } = useTranslation();
  const { data, isPending, isError, error } = useBranchesQuery(repoId);

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

      <Card className="overflow-hidden p-0">
        <CardHeader className="p-6 pb-0">
          <CardTitle>
            {t("repositories.view.branches_title")}
            {data.branches.length > 0 ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({data.branches.length})
              </span>
            ) : null}
          </CardTitle>
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
