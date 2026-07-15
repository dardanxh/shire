import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  GitBranchIcon,
  Loader2Icon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { useMergeReviewQuery, useReanalyzeMergeReviewMutation } from "../api";
import { ClassificationBadges } from "./ClassificationBadges";
import { DeleteMergeReviewDialog } from "./DeleteMergeReviewDialog";
import { FootprintSection } from "./FootprintSection";
import { HobitReviewsSection } from "./HobitReviewsSection";
import { HumanOverviewPanel } from "./HumanOverviewPanel";
import { StalenessBanner } from "./StalenessBanner";
import { VerdictHeader } from "./VerdictHeader";

/**
 * The MR review, layered top-down: verdict → classification → human overview →
 * git footprint → hobit reviews. One polled query drives the whole page; each
 * layer fills in as its background section completes.
 */
export function MergeReviewViewPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: review, isPending } = useMergeReviewQuery(id);
  const { mutate: reanalyze, isPending: isReanalyzing } =
    useReanalyzeMergeReviewMutation(id);

  if (isPending) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <Skeleton className="h-9 w-1/2" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!review) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        {t("merge_reviews.view.not_found")}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-3">
        <Link
          to="/merge-reviews"
          search={{ page: 1, size: 20 }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          {t("merge_reviews.view.back")}
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">
              {review.title ||
                `${review.source_branch} → ${review.target_branch}`}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Link
                to="/repositories/$id"
                params={{ id: review.repository_id }}
                search={{ tab: "mrs" }}
                className="hover:text-foreground hover:underline"
              >
                {review.repo_slug}
              </Link>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1 font-mono text-xs">
                <GitBranchIcon className="size-3.5" />
                {review.source_branch}
                <ArrowRightIcon className="size-3" />
                {review.target_branch}
              </span>
              <span aria-hidden>·</span>
              <span className="text-xs">
                {review.analyzed_at
                  ? t("merge_reviews.view.analyzed", {
                      date: formatDateTime(review.analyzed_at),
                    })
                  : t("merge_reviews.view.created", {
                      date: formatDateTime(review.created_at),
                    })}
              </span>
              {review.analyzed_source_sha ? (
                <Badge variant="outline" className="font-mono text-[10px]">
                  {review.analyzed_source_sha.slice(0, 7)}
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              onClick={() => reanalyze()}
              disabled={isReanalyzing}
            >
              {isReanalyzing ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <RefreshCwIcon className="size-4" />
              )}
              {isReanalyzing
                ? t("merge_reviews.view.reanalyzing")
                : t("merge_reviews.view.reanalyze")}
            </Button>
            <DeleteMergeReviewDialog
              id={review.id}
              trigger={
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t("merge_reviews.delete.confirm")}
                >
                  <Trash2Icon className="size-4 text-muted-foreground" />
                </Button>
              }
              onDeleted={() =>
                navigate({
                  to: "/merge-reviews",
                  search: { page: 1, size: 20 },
                })
              }
            />
          </div>
        </div>
      </div>

      <StalenessBanner
        review={review}
        onReanalyze={() => reanalyze()}
        isReanalyzing={isReanalyzing}
      />

      <VerdictHeader review={review} />
      <ClassificationBadges review={review} />
      <HumanOverviewPanel review={review} />
      {review.footprint ? (
        <FootprintSection footprint={review.footprint} />
      ) : null}
      <HobitReviewsSection review={review} />
    </div>
  );
}
