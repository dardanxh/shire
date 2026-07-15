import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronRightIcon, ListChecksIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DataTable } from "@/components/shared/DataTable";
import { DataTablePagination } from "@/components/shared/DataTablePagination";
import { Card } from "@/components/ui/card";
import { extractErrorMessage, type JobOut } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useJobsQuery } from "../api";
import { JobStatusBadge } from "./JobStatusBadge";

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export function JobsListPage({
  page,
  size,
  onPageChange,
  onSizeChange,
}: {
  page: number;
  size: number;
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isPending, isError, error } = useJobsQuery({
    page,
    page_size: size,
  });

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
            </p>
          </div>
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
        id: "chevron",
        header: "",
        meta: { className: "w-10", isAction: true },
        cell: () => (
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        ),
      },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("jobs.list.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("jobs.list.subtitle")}
        </p>
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
