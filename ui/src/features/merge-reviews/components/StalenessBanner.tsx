import { Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { MergeReviewDetailOut } from "@/lib/api";

/** Amber "the source branch has moved" bar with an inline Re-analyze action. */
export function StalenessBanner({
  review,
  onReanalyze,
  isReanalyzing,
}: {
  review: MergeReviewDetailOut;
  onReanalyze: () => void;
  isReanalyzing: boolean;
}) {
  const { t } = useTranslation();
  if (!review.stale) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
      <TriangleAlertIcon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="min-w-0 flex-1">
        {t("merge_reviews.staleness.message", {
          analyzed: review.analyzed_source_sha?.slice(0, 7) ?? "?",
          current: review.current_source_sha?.slice(0, 7) ?? "?",
        })}
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={onReanalyze}
        disabled={isReanalyzing}
      >
        {isReanalyzing ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : null}
        {t("merge_reviews.staleness.action")}
      </Button>
    </div>
  );
}
