import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  Loader2Icon,
  RotateCcwIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CollapsibleBlock } from "@/components/shared/CollapsibleBlock";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { JobDetailOut } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCancelJobMutation, useJobQuery, useRetryJobMutation } from "../api";
import { JobStatusBadge } from "./JobStatusBadge";
import { formatTokens } from "./JobsListPage";

const LIST_SEARCH = { tab: "runs", page: 1, size: 20 } as const;

export function JobViewPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: job, isPending } = useJobQuery(id);
  const { mutate: cancelJob, isPending: isCancelling } = useCancelJobMutation();
  const { mutate: retryJob, isPending: isRetrying } = useRetryJobMutation();

  if (isPending) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!job) {
    return (
      <p className="py-16 text-center text-muted-foreground">
        {t("jobs.view.not_found")}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <button
        type="button"
        onClick={() => navigate({ to: "/jobs", search: LIST_SEARCH })}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        {t("jobs.view.back")}
      </button>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {job.kind} · {job.id}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {job.status === "pending" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={isCancelling}
              onClick={() =>
                cancelJob(job.id, {
                  onSuccess: () => toast.success(t("jobs.actions.cancel_done")),
                })
              }
            >
              <XIcon className="size-3.5" />
              {t("jobs.actions.cancel")}
            </Button>
          ) : null}
          {job.status === "failed" || job.status === "cancelled" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={isRetrying}
              onClick={() =>
                retryJob(job.id, {
                  onSuccess: (fresh) => {
                    toast.success(t("jobs.actions.retry_done"));
                    navigate({ to: "/jobs/$id", params: { id: fresh.id } });
                  },
                })
              }
            >
              <RotateCcwIcon className="size-3.5" />
              {t("jobs.actions.retry")}
            </Button>
          ) : null}
          <JobStatusBadge status={job.status} />
        </div>
      </div>

      <Card className="p-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <MetaItem label={t("jobs.view.created")}>
            {formatDateTime(job.created_at)}
          </MetaItem>
          <MetaItem label={t("jobs.view.started")}>
            {job.started_at ? formatDateTime(job.started_at) : "—"}
          </MetaItem>
          <MetaItem label={t("jobs.view.finished")}>
            {job.finished_at ? formatDateTime(job.finished_at) : "—"}
          </MetaItem>
          <MetaItem label={t("jobs.view.duration")}>
            {job.duration_seconds != null
              ? `${job.duration_seconds.toFixed(1)}s`
              : "—"}
          </MetaItem>
          <MetaItem label={t("jobs.view.model")}>{job.model ?? "—"}</MetaItem>
          <MetaItem label={t("jobs.view.attempts")}>{job.attempts}</MetaItem>
          <MetaItem label={t("jobs.view.worker")}>
            {job.worker_id ?? "—"}
          </MetaItem>
          {job.repository_id ? (
            <MetaItem label={t("jobs.view.repository")}>
              <Link
                to="/repositories/$id"
                params={{ id: job.repository_id }}
                search={{ tab: "overview", tool: undefined }}
                className="text-primary hover:underline"
              >
                {t("jobs.view.repository_link")}
              </Link>
            </MetaItem>
          ) : null}
        </dl>
      </Card>

      {job.usage ? (
        <Card className="p-5">
          <h2 className="text-sm font-semibold">{t("jobs.view.usage")}</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <MetaItem label={t("jobs.view.usage_total")}>
              {formatTokens(job.total_tokens)}
            </MetaItem>
            <MetaItem label={t("jobs.view.usage_input")}>
              {formatTokens(job.usage.input_tokens)}
            </MetaItem>
            <MetaItem label={t("jobs.view.usage_output")}>
              {formatTokens(job.usage.output_tokens)}
            </MetaItem>
            <MetaItem label={t("jobs.view.usage_cache_read")}>
              {formatTokens(job.usage.cache_read_input_tokens)}
            </MetaItem>
            <MetaItem label={t("jobs.view.usage_cache_write")}>
              {formatTokens(job.usage.cache_creation_input_tokens)}
            </MetaItem>
            <MetaItem label={t("jobs.view.usage_cost")}>
              {job.usage.total_cost_usd != null
                ? `$${job.usage.total_cost_usd.toFixed(4)}`
                : "—"}
            </MetaItem>
            <MetaItem label={t("jobs.view.usage_turns")}>
              {job.usage.num_turns ?? "—"}
            </MetaItem>
            {job.usage.models?.length ? (
              <MetaItem label={t("jobs.view.usage_models")}>
                <span className="font-mono text-xs">
                  {job.usage.models.join(", ")}
                </span>
              </MetaItem>
            ) : null}
          </dl>
        </Card>
      ) : null}

      {job.error ? (
        <Card className="border-red-500/25 bg-red-500/5 p-5">
          <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">
            {t("jobs.view.error")}
          </h2>
          <p className="mt-2 whitespace-pre-wrap font-mono text-xs text-red-700/90 dark:text-red-400/90">
            {job.error}
          </p>
        </Card>
      ) : null}

      {job.progress.length > 0 || job.status === "running" ? (
        <ActivityFeed job={job} />
      ) : null}

      <CollapsibleBlock
        title={t("jobs.view.prompt")}
        content={job.prompt}
        defaultOpen={false}
      />
      <CollapsibleBlock
        title={t("jobs.view.result")}
        content={job.result ?? null}
        emptyLabel={t("jobs.view.no_result")}
        defaultOpen
      />
    </div>
  );
}

/**
 * The live agent transcript the engine streams while the job runs: assistant
 * messages as prose, tool calls as compact mono rows, tool results muted. The
 * detail query already polls while the job is unsettled, so new entries appear
 * on their own; the feed keeps itself scrolled to the newest entry while live.
 */
function ActivityFeed({ job }: { job: JobDetailOut }) {
  const { t } = useTranslation();
  const running = job.status === "running";
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Side effect: pin the feed to the newest entry as long as the run is live.
  const eventCount = job.progress.length;
  useEffect(() => {
    if (running && eventCount > 0 && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [running, eventCount]);

  return (
    <Card className="gap-0 p-0">
      <div className="flex items-center gap-2 px-5 py-3.5">
        <h2 className="text-sm font-semibold">{t("jobs.view.activity")}</h2>
        {running ? (
          <Loader2Icon className="size-3.5 animate-spin text-primary" />
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {t("jobs.view.activity_count", { count: job.progress.length })}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="max-h-[28rem] space-y-2 overflow-y-auto border-t border-border px-5 py-4"
      >
        {job.progress.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("jobs.view.activity_waiting")}
          </p>
        ) : null}
        {job.progress.map((event, index) => {
          const key = `${index}-${event.type}`;
          if (event.type === "text") {
            return (
              <p
                key={key}
                className="whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-sm leading-relaxed"
              >
                {event.text}
              </p>
            );
          }
          if (event.type === "tool") {
            return (
              <p
                key={key}
                className="flex items-center gap-2 px-1 font-mono text-xs text-muted-foreground"
              >
                <WrenchIcon className="size-3 shrink-0" />
                <span className="font-semibold text-foreground/80">
                  {event.tool}
                </span>
                <span className="truncate">{event.detail}</span>
              </p>
            );
          }
          return (
            <p
              key={key}
              className={cn(
                "truncate px-6 font-mono text-xs",
                event.error
                  ? "text-red-600/80 dark:text-red-400/80"
                  : "text-muted-foreground/70",
              )}
            >
              ↳ {event.detail}
            </p>
          );
        })}
      </div>
    </Card>
  );
}

function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 break-all">{children}</dd>
    </div>
  );
}
