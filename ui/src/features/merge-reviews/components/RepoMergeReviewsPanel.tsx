import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronRightIcon, GitPullRequestIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DataTable } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { extractErrorMessage, type MergeReviewOut } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useMergeReviewsQuery } from "../api";
import { CreateMergeReviewDialog } from "./CreateMergeReviewDialog";
import { SizeClassBadge } from "./SizeClassBadge";
import { VerdictBadge } from "./VerdictBadge";

/** The repository page's "MRs" tab: this repo's analyzed reviews + a create
 * shortcut with the repository preselected. Scoped view — page 1 is enough;
 * the global /merge-reviews page owns real pagination. */
export function RepoMergeReviewsPanel({ repoId }: { repoId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isPending, isError, error } = useMergeReviewsQuery({
    page: 1,
    page_size: 50,
    repository_id: repoId,
  });

  const rows = data?.items ?? [];

  const columns = useMemo<ColumnDef<MergeReviewOut>[]>(
    () => [
      {
        id: "title",
        header: t("merge_reviews.list.col_title"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="font-medium">
              {row.original.title ||
                `${row.original.source_branch} → ${row.original.target_branch}`}
            </span>
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {row.original.source_branch} → {row.original.target_branch}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "risk_verdict",
        header: t("merge_reviews.list.col_verdict"),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <VerdictBadge verdict={row.original.risk_verdict} />
            {row.original.risk_score != null ? (
              <span className="text-xs tabular-nums text-muted-foreground">
                {row.original.risk_score}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "size",
        header: t("merge_reviews.list.col_size"),
        cell: ({ row }) => <SizeClassBadge size={row.original.size} />,
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
        id: "chevron",
        header: "",
        meta: { className: "w-8" },
        cell: () => (
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        ),
      },
    ],
    [t],
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CreateMergeReviewDialog defaultRepositoryId={repoId} />
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
                <CreateMergeReviewDialog
                  defaultRepositoryId={repoId}
                  trigger={
                    <Button variant="outline">
                      {t("merge_reviews.create.trigger")}
                    </Button>
                  }
                />
              </div>
            </div>
          }
        />
      </Card>
    </div>
  );
}
