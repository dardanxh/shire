import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { MapIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DataTable } from "@/components/shared/DataTable";
import { DataTablePagination } from "@/components/shared/DataTablePagination";
import { buttonVariants } from "@/components/ui/button";
import { JobStatusBadge } from "@/features/jobs";
import type { RoadmapOut } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRoadmapsQuery } from "../api";

/** The roadmaps list: scope, current version and progress at a glance. */
export function RoadmapsListPage({
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
  const { data, isPending, isError } = useRoadmapsQuery({
    page,
    page_size: size,
  });

  const columns: ColumnDef<RoadmapOut>[] = [
    {
      accessorKey: "name",
      header: t("roadmaps.list.col_name"),
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name}</p>
          {row.original.goal ? (
            <p className="max-w-md truncate text-xs text-muted-foreground">
              {row.original.goal}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "repositories",
      header: t("roadmaps.list.col_repositories"),
      cell: ({ row }) => (
        <div className="flex max-w-64 flex-wrap gap-1">
          {row.original.repositories.map((repo) => (
            <span
              key={repo.id}
              className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
            >
              {repo.name}
            </span>
          ))}
        </div>
      ),
    },
    {
      id: "version",
      header: t("roadmaps.list.col_version"),
      cell: ({ row }) =>
        row.original.generation_status === "pending" ? (
          <JobStatusBadge status="running" />
        ) : row.original.version_number ? (
          `v${row.original.version_number}`
        ) : (
          "—"
        ),
    },
    {
      id: "progress",
      header: t("roadmaps.list.col_progress"),
      cell: ({ row }) => {
        const { items_done: done, items_total: total } = row.original;
        if (total === 0) return "—";
        const pct = Math.round((done / total) * 100);
        return (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {done}/{total}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "updated_at",
      header: t("roadmaps.list.col_updated"),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {formatDate(row.original.updated_at)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {t("roadmaps.list.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("roadmaps.list.subtitle")}
          </p>
        </div>
        <Link to="/roadmaps/new" className={cn(buttonVariants())}>
          <PlusIcon className="size-4" />
          {t("roadmaps.list.new")}
        </Link>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        isPending={isPending}
        isError={isError}
        onRowClick={(row) =>
          navigate({
            to: "/roadmaps/$id",
            params: { id: row.id },
            search: { tab: "board" },
          })
        }
        emptyState={
          <div className="flex flex-col items-center gap-3 py-10">
            <MapIcon className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t("roadmaps.list.empty")}
            </p>
            <Link
              to="/roadmaps/new"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {t("roadmaps.list.empty_cta")}
            </Link>
          </div>
        }
      />
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
  );
}
