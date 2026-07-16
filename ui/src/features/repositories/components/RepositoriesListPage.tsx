import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronRightIcon, GitBranchIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DataTable } from "@/components/shared/DataTable";
import { DataTablePagination } from "@/components/shared/DataTablePagination";
import { Card } from "@/components/ui/card";
import type { RepositoryOut } from "@/lib/api";
import { extractErrorMessage } from "@/lib/api";
import { formatDate, formatTimeAgo } from "@/lib/format";
import { useRepositoriesQuery } from "../api";
import { IngestRepositoryDialog } from "./IngestRepositoryDialog";
import { StatusBadge } from "./StatusBadge";

export function RepositoriesListPage({
  page,
  size,
  onPageChange,
  onSizeChange,
  wizardOpen,
  onWizardOpenChange,
}: {
  page: number;
  size: number;
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
  wizardOpen?: boolean;
  onWizardOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isPending, isError, error } = useRepositoriesQuery({
    page,
    page_size: size,
  });

  const pageRows = data?.items ?? [];
  const total = data?.total ?? 0;

  const columns = useMemo<ColumnDef<RepositoryOut>[]>(
    () => [
      {
        accessorKey: "slug",
        header: t("repositories.list.col_repository"),
        cell: ({ row }) => (
          <div>
            <span className="font-medium">{row.original.slug}</span>
            {row.original.status === "failed" && row.original.error ? (
              <p className="mt-0.5 max-w-md truncate text-xs text-destructive">
                {row.original.error}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "provider",
        header: t("repositories.list.col_provider"),
        cell: ({ row }) => (
          <span className="capitalize text-muted-foreground">
            {row.original.provider}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: t("repositories.list.col_status"),
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "default_branch",
        header: t("repositories.list.col_branch"),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.default_branch}
          </span>
        ),
      },
      {
        accessorKey: "last_analyzed_at",
        header: t("repositories.list.col_last_polled"),
        cell: ({ row }) => (
          <div className="text-muted-foreground">
            <div>{formatDate(row.original.last_analyzed_at)}</div>
            {row.original.last_analyzed_at ? (
              <div className="text-xs">
                {formatTimeAgo(row.original.last_analyzed_at)}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: "chevron",
        header: "",
        meta: { className: "w-8" },
        cell: () => (
          <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        ),
      },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      {/* The hub's tab strip is the title — only the action lives here. */}
      <div className="flex justify-end">
        <IngestRepositoryDialog
          open={wizardOpen}
          onOpenChange={onWizardOpenChange}
        />
      </div>

      <Card className="overflow-hidden p-0">
        <DataTable
          columns={columns}
          data={pageRows}
          isPending={isPending}
          isError={isError}
          errorMessage={t("common.states.api_unreachable", {
            message: error ? extractErrorMessage(error) : "",
          })}
          onRowClick={(repo) =>
            navigate({
              to: "/repositories/$id",
              params: { id: repo.id },
              search: { tab: "overview" },
            })
          }
          emptyState={
            <div className="flex flex-col items-center gap-2 p-12 text-center">
              <GitBranchIcon className="size-8 text-muted-foreground" />
              <p className="font-medium">
                {t("repositories.list.empty_title")}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {t("repositories.list.empty_body")}
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
