import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronRightIcon, ListChecksIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { DataTable } from "@/components/shared/DataTable";
import { DataTablePagination } from "@/components/shared/DataTablePagination";
import { Card } from "@/components/ui/card";
import { extractErrorMessage, type JobOut } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useJobsQuery } from "../api";
import { JobStatusBadge } from "./JobStatusBadge";
import { formatTokens } from "./JobsListPage";

/** All engine runs for one repository — the repo view's Jobs tab (pagination is local
 * state: the tab already lives in the URL, page position doesn't need to). */
export function RepoJobsPanel({ repositoryId }: { repositoryId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const { data, isPending, isError, error } = useJobsQuery({
    page,
    page_size: size,
    repository_id: repositoryId,
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
              {row.original.model ? ` · ${row.original.model}` : ""}
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
            <p className="font-medium">{t("jobs.repo.empty_title")}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t("jobs.repo.empty_body")}
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
            onPageChange={setPage}
            onSizeChange={(next) => {
              setSize(next);
              setPage(1);
            }}
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
  );
}
