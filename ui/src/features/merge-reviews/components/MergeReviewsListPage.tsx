import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ChevronRightIcon,
  GitPullRequestIcon,
  Loader2Icon,
  Trash2Icon,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DataTable } from "@/components/shared/DataTable";
import { DataTablePagination } from "@/components/shared/DataTablePagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { extractErrorMessage, type MergeReviewOut } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useMergeReviewsQuery } from "../api";
import { CreateMergeReviewDialog } from "./CreateMergeReviewDialog";
import { DeleteMergeReviewDialog } from "./DeleteMergeReviewDialog";
import { SizeClassBadge } from "./SizeClassBadge";
import { VerdictBadge } from "./VerdictBadge";

export function reviewTitle(review: MergeReviewOut): string {
  return review.title || `${review.source_branch} → ${review.target_branch}`;
}

export function MergeReviewsListPage({
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
  const { data, isPending, isError, error } = useMergeReviewsQuery({
    page,
    page_size: size,
  });

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;

  const columns = useMemo<ColumnDef<MergeReviewOut>[]>(
    () => [
      {
        id: "title",
        header: t("merge_reviews.list.col_title"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="font-medium">{reviewTitle(row.original)}</span>
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {row.original.source_branch} → {row.original.target_branch}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "repo_slug",
        header: t("merge_reviews.list.col_repo"),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.repo_slug}
          </span>
        ),
      },
      {
        accessorKey: "risk_verdict",
        header: t("merge_reviews.list.col_verdict"),
        cell: ({ row }) =>
          row.original.risk_verdict ? (
            <div className="flex items-center gap-2">
              <VerdictBadge verdict={row.original.risk_verdict} />
              <span className="text-xs tabular-nums text-muted-foreground">
                {row.original.risk_score}
              </span>
            </div>
          ) : (
            <StatusHint status={row.original.overall_status} />
          ),
      },
      {
        accessorKey: "size",
        header: t("merge_reviews.list.col_size"),
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <SizeClassBadge size={row.original.size} />
            {row.original.files_changed != null ? (
              <p className="text-xs tabular-nums text-muted-foreground">
                {t("merge_reviews.size.facts_short", {
                  files: row.original.files_changed,
                  additions: row.original.total_additions ?? 0,
                  deletions: row.original.total_deletions ?? 0,
                })}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "created_at",
        header: t("merge_reviews.list.col_created"),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDate(row.original.created_at)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        meta: { className: "w-16", isAction: true },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <DeleteMergeReviewDialog
              id={row.original.id}
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("merge_reviews.delete.confirm")}
                >
                  <Trash2Icon className="size-4 text-muted-foreground" />
                </Button>
              }
            />
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </div>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      {/* The hub's tab strip is the title — only the action lives here. */}
      <div className="flex justify-end">
        <CreateMergeReviewDialog />
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
          onRowClick={(review) =>
            navigate({ to: "/merge-reviews/$id", params: { id: review.id } })
          }
          emptyState={
            <div className="flex flex-col items-center gap-2 p-12 text-center">
              <GitPullRequestIcon className="size-8 text-muted-foreground" />
              <p className="font-medium">
                {t("merge_reviews.list.empty_title")}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {t("merge_reviews.list.empty_body")}
              </p>
              <div className="mt-2">
                <CreateMergeReviewDialog />
              </div>
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

function StatusHint({ status }: { status: string }) {
  const { t } = useTranslation();
  if (status === "failed") {
    return (
      <Badge variant="outline" className="text-destructive">
        {t("merge_reviews.list.status_failed")}
      </Badge>
    );
  }
  if (status === "completed") {
    return (
      <span className="text-xs text-muted-foreground">
        {t("merge_reviews.list.status_ready")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Loader2Icon className="size-3 animate-spin" />
      {t("merge_reviews.list.status_analyzing")}
    </span>
  );
}
