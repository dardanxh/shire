import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { useJobQuery } from "../api";
import { JobStatusBadge } from "./JobStatusBadge";

const LIST_SEARCH = { page: 1, size: 20 } as const;

export function JobViewPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: job, isPending } = useJobQuery(id);

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
        <JobStatusBadge status={job.status} className="shrink-0" />
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

function CollapsibleBlock({
  title,
  content,
  emptyLabel,
  defaultOpen,
}: {
  title: string;
  content: string | null;
  emptyLabel?: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 px-5 py-3.5 text-sm font-semibold"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        )}
        {title}
      </button>
      {open ? (
        <div className="border-t border-border px-5 py-4">
          {content ? (
            <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
              {content}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">{emptyLabel ?? "—"}</p>
          )}
        </div>
      ) : null}
    </Card>
  );
}
