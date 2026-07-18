import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { FlameIcon, LandmarkIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DataTable } from "@/components/shared/DataTable";
import { DataTablePagination } from "@/components/shared/DataTablePagination";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CouncilTopicOut } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isTopicActive, useCouncilTopicsQuery } from "../api";

export function CouncilStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <Badge
      variant={
        status === "failed"
          ? "destructive"
          : isTopicActive(status)
            ? "secondary"
            : "outline"
      }
    >
      {t(`council.status.${status}`)}
    </Badge>
  );
}

/** The council topics list: what's being debated and where each debate stands. */
export function CouncilsListPage({
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
  const { data, isPending, isError } = useCouncilTopicsQuery({
    page,
    page_size: size,
  });

  const columns: ColumnDef<CouncilTopicOut>[] = [
    {
      accessorKey: "name",
      header: t("council.list.col_name"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <p className="font-medium">{row.original.name}</p>
          {row.original.devils_advocate ? (
            <FlameIcon
              className="size-3.5 text-destructive"
              aria-label={t("council.list.da_indicator")}
            />
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: t("council.list.col_status"),
      cell: ({ row }) => <CouncilStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "member_count",
      header: t("council.list.col_members"),
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.member_count}</span>
      ),
    },
    {
      accessorKey: "repository_count",
      header: t("council.list.col_repositories"),
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.repository_count}</span>
      ),
    },
    {
      accessorKey: "updated_at",
      header: t("council.list.col_updated"),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {formatDate(row.original.updated_at)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-3">
        <Link to="/council/new" className={cn(buttonVariants())}>
          <PlusIcon className="size-4" />
          {t("council.list.new")}
        </Link>
      </div>

      <Card className="overflow-hidden p-0">
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          isPending={isPending}
          isError={isError}
          onRowClick={(row) =>
            navigate({ to: "/council/$id", params: { id: row.id } })
          }
          emptyState={
            <div className="flex flex-col items-center gap-3 py-10">
              <LandmarkIcon className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t("council.list.empty")}
              </p>
              <Link
                to="/council/new"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                )}
              >
                {t("council.list.empty_cta")}
              </Link>
            </div>
          }
        />
        {(data?.total ?? 0) > 0 ? (
          <div className="border-t border-border">
            <DataTablePagination
              page={page}
              size={size}
              total={data?.total ?? 0}
              labels={{
                rowsPerPage: t("common.pagination.rows_per_page"),
                pageOf: t("common.pagination.page_of"),
                previous: t("common.pagination.previous"),
                next: t("common.pagination.next"),
              }}
              onPageChange={onPageChange}
              onSizeChange={onSizeChange}
            />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
