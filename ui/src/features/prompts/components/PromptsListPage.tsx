import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { PlusIcon, SparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DataTable } from "@/components/shared/DataTable";
import { DataTablePagination } from "@/components/shared/DataTablePagination";
import { Sparkline } from "@/components/shared/Sparkline";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { extractErrorMessage, type PromptOut } from "@/lib/api";
import { formatNumber, formatTimeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePromptsQuery } from "../api";
import { ScoreBadge } from "./ScoreBadge";

export function PromptsListPage({
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
  const { data, isPending, isError, error } = usePromptsQuery({
    page,
    page_size: size,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const columns: ColumnDef<PromptOut, unknown>[] = [
    {
      accessorKey: "name",
      header: t("prompts.list.columns.name"),
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{row.original.name}</span>
          {row.original.description ? (
            <span className="line-clamp-1 text-xs text-muted-foreground">
              {row.original.description}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "static_score",
      header: t("prompts.list.columns.score"),
      cell: ({ row }) => <ScoreBadge score={row.original.static_score} />,
    },
    {
      id: "trend",
      header: t("prompts.list.columns.trend"),
      cell: ({ row }) => (
        <Sparkline
          values={row.original.score_history}
          title={t("prompts.list.trend_title")}
        />
      ),
    },
    {
      accessorKey: "estimated_input_tokens",
      header: t("prompts.list.columns.tokens"),
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">
          {formatNumber(row.original.estimated_input_tokens)}
        </span>
      ),
    },
    {
      accessorKey: "version_count",
      header: t("prompts.list.columns.versions"),
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.version_count}</Badge>
      ),
    },
    {
      accessorKey: "updated_at",
      header: t("prompts.list.columns.updated"),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatTimeAgo(row.original.updated_at)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("prompts.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("prompts.desc")}
          </p>
        </div>
        <Link to="/prompts/new" className={cn(buttonVariants())}>
          <PlusIcon className="size-4" />
          {t("prompts.list.new")}
        </Link>
      </div>

      <Card className="p-0">
        <DataTable
          columns={columns}
          data={items}
          isPending={isPending}
          isError={isError}
          errorMessage={t("prompts.load_error", {
            message: extractErrorMessage(error),
          })}
          onRowClick={(row) =>
            navigate({
              to: "/prompts/$id",
              params: { id: row.id },
              search: { tab: "editor" },
            })
          }
          emptyState={
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <SparklesIcon className="size-8 text-muted-foreground" />
              <p className="font-medium">{t("prompts.list.empty_title")}</p>
              <p className="max-w-md text-sm text-muted-foreground">
                {t("prompts.list.empty_body")}
              </p>
              <Link
                to="/prompts/new"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                )}
              >
                <PlusIcon className="size-4" />
                {t("prompts.list.new")}
              </Link>
            </div>
          }
        />
        {total > size ? (
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
        ) : null}
      </Card>
    </div>
  );
}
