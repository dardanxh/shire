import { Link } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  Loader2Icon,
  SparklesIcon,
  XCircleIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  type ActionRun,
  useActionRunsQuery,
  useMarkBookmarkReadMutation,
  useMarkRunReadMutation,
} from "../api";

/** The action's history, newest first: what it found, what's new, and its job. */
export function ActionRunsList({
  bookmarkId,
  page,
  onPageChange,
}: {
  bookmarkId: string;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  const { data, isPending } = useActionRunsQuery(bookmarkId, page);
  const { mutate: markAllRead, isPending: isMarking } =
    useMarkBookmarkReadMutation(bookmarkId);
  const hasUnread = data?.items.some((run) => run.notify && !run.read_at);

  if (isPending) return <Skeleton className="h-48 w-full" />;
  if (!data || data.items.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        {t("launchpad.runs.empty")}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {hasUnread ? (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={isMarking}
            onClick={() => markAllRead()}
          >
            {t("launchpad.runs.mark_all_read")}
          </Button>
        </div>
      ) : null}
      {data.items.map((run) => (
        <RunCard key={run.id} run={run} />
      ))}
      {data.total_pages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">
            {t("common.pagination.page_of", {
              page,
              count: data.total_pages,
            })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            {t("common.pagination.previous")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.total_pages}
            onClick={() => onPageChange(page + 1)}
          >
            {t("common.pagination.next")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function RunCard({ run }: { run: ActionRun }) {
  const { t } = useTranslation();
  const { mutate: markRead } = useMarkRunReadMutation();
  const unread = run.notify && !run.read_at;

  return (
    <Card className={cn("gap-3 p-4", unread && "border-amber-500/40")}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <OutcomeIcon run={run} />
        <span className="font-medium">
          {run.status === "pending"
            ? t("launchpad.runs.pending")
            : t(`launchpad.runs.outcome.${run.outcome ?? "error"}`)}
        </span>
        {run.new_count > 0 ? (
          <Badge variant="warning">
            <SparklesIcon className="size-3" />
            {t("launchpad.runs.new", { count: run.new_count })}
          </Badge>
        ) : null}
        <Badge variant="outline">
          {t(`launchpad.runs.trigger.${run.trigger}`)}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {formatDateTime(run.created_at)}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {unread ? (
            <Button variant="ghost" size="sm" onClick={() => markRead(run.id)}>
              {t("launchpad.runs.mark_read")}
            </Button>
          ) : null}
          {run.job_id ? (
            <Link
              to="/jobs/$id"
              params={{ id: run.job_id }}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              {t("launchpad.runs.view_job")}
            </Link>
          ) : null}
        </span>
      </div>
      {run.summary ? <p className="text-sm">{run.summary}</p> : null}
      {run.items.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border">
          {run.items.map((item) => (
            <li key={item.key} className="flex items-start gap-2 p-2.5 text-sm">
              {item.is_new ? (
                <Badge variant="warning" className="shrink-0">
                  {t("launchpad.runs.new_badge")}
                </Badge>
              ) : (
                <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">
                  {t("launchpad.runs.seen_badge")}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  <span className="mr-1.5 font-mono text-xs text-muted-foreground">
                    {item.key}
                  </span>
                  {item.title}
                </p>
                {item.detail ? (
                  <p className="text-muted-foreground">{item.detail}</p>
                ) : null}
              </div>
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={t("launchpad.runs.open_item", {
                    title: item.title,
                  })}
                >
                  <ExternalLinkIcon className="size-4" />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function OutcomeIcon({ run }: { run: ActionRun }) {
  if (run.status === "pending")
    return (
      <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
    );
  if (run.outcome === "attention")
    return <AlertTriangleIcon className="size-4 text-amber-600" />;
  if (run.outcome === "clear")
    return <CheckCircle2Icon className="size-4 text-emerald-600" />;
  return <XCircleIcon className="size-4 text-destructive" />;
}
