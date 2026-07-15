import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ChevronRightIcon,
  ListChecksIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { DataTable } from "@/components/shared/DataTable";
import { DataTablePagination } from "@/components/shared/DataTablePagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  extractErrorMessage,
  JOB_STATUSES,
  type JobOut,
  type JobStatus,
} from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useCancelJobMutation,
  useJobsQuery,
  useRetryJobMutation,
} from "../api";
import { JobStatusBadge } from "./JobStatusBadge";

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export function formatTokens(tokens: number | null | undefined): string {
  if (tokens == null) return "—";
  if (tokens < 1000) return String(tokens);
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

export function JobsListPage({
  page,
  size,
  status,
  onPageChange,
  onSizeChange,
  onStatusChange,
}: {
  page: number;
  size: number;
  status?: JobStatus;
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
  onStatusChange: (status: JobStatus | undefined) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isPending, isError, error } = useJobsQuery({
    page,
    page_size: size,
    status,
  });
  const { mutate: cancelJob } = useCancelJobMutation();
  const { mutate: retryJob } = useRetryJobMutation();

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;

  const columns = useMemo<ColumnDef<JobOut>[]>(
    () => [
      {
        accessorKey: "status",
        header: t("jobs.list.col_status"),
        meta: { className: "w-32" },
        cell: ({ row }) => <JobStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "title",
        header: t("jobs.list.col_title"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="font-medium">{row.original.title}</span>
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {row.original.kind}
              {row.original.model ? ` · ${row.original.model}` : ""}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "model",
        header: t("jobs.list.col_model"),
        meta: { className: "w-28" },
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.model ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "created_at",
        header: t("jobs.list.col_created"),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDateTime(row.original.created_at)}
          </span>
        ),
      },
      {
        accessorKey: "duration_seconds",
        header: t("jobs.list.col_duration"),
        meta: { className: "w-28" },
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {formatDuration(row.original.duration_seconds)}
          </span>
        ),
      },
      {
        accessorKey: "total_tokens",
        header: t("jobs.list.col_tokens"),
        meta: { className: "w-28" },
        cell: ({ row }) => (
          <div className="tabular-nums text-muted-foreground">
            {formatTokens(row.original.total_tokens)}
            {row.original.total_cost_usd != null ? (
              <p className="text-xs">
                ${row.original.total_cost_usd.toFixed(3)}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        meta: { className: "w-24", isAction: true },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            {row.original.status === "pending" ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("jobs.actions.cancel")}
                title={t("jobs.actions.cancel")}
                onClick={() =>
                  cancelJob(row.original.id, {
                    onSuccess: () =>
                      toast.success(t("jobs.actions.cancel_done")),
                  })
                }
              >
                <XIcon className="size-4 text-muted-foreground" />
              </Button>
            ) : null}
            {row.original.status === "failed" ||
            row.original.status === "cancelled" ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("jobs.actions.retry")}
                title={t("jobs.actions.retry")}
                onClick={() =>
                  retryJob(row.original.id, {
                    onSuccess: () =>
                      toast.success(t("jobs.actions.retry_done")),
                  })
                }
              >
                <RotateCcwIcon className="size-4 text-muted-foreground" />
              </Button>
            ) : null}
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </div>
        ),
      },
    ],
    [t, cancelJob, retryJob],
  );

  return (
    <div className="space-y-4">
      {/* Status filter chips: undefined = all. */}
      <div className="flex flex-wrap gap-1.5">
        <FilterChip
          label={t("jobs.filter.all")}
          active={status === undefined}
          onClick={() => onStatusChange(undefined)}
        />
        {JOB_STATUSES.map((s) => (
          <FilterChip
            key={s}
            label={t(`jobs.status.${s}`)}
            active={status === s}
            onClick={() => onStatusChange(s)}
          />
        ))}
      </div>

      <Card className="overflow-hidden p-0">
        <DataTable
          columns={columns}
          data={rows}
          isPending={isPending}
          isError={isError}
          errorMessage={t("common.states.api_unreachable", {
            message: error ? extractErrorMessage(error) : "",
          })}
          onRowClick={(job) =>
            navigate({ to: "/jobs/$id", params: { id: job.id } })
          }
          emptyState={
            <div className="flex flex-col items-center gap-2 p-12 text-center">
              <ListChecksIcon className="size-8 text-muted-foreground" />
              <p className="font-medium">{t("jobs.list.empty_title")}</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {t("jobs.list.empty_body")}
              </p>
            </div>
          }
        />
        {total > 0 ? (
          <div className="border-t border-border">
            <DataTablePagination
              page={page}
              size={size}
              total={total}
              onPageChange={onPageChange}
              onSizeChange={onSizeChange}
              labels={{
                rowsPerPage: t("common.pagination.rows_per_page"),
                pageOf: t("common.pagination.page_of"),
                previous: t("common.pagination.previous"),
                next: t("common.pagination.next"),
              }}
            />
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
