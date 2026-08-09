import { StarIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Markdown } from "@/components/shared/Markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SeverityDot } from "@/features/principles/components/badges";
import type { MergeReviewDetailOut } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useDeleteRemarkMutation } from "../api";
import { ReviewSeverityBadge } from "./ReviewSeverityBadge";

/**
 * The human-remarks tab — only what the reader starred, in the order they starred it.
 *
 * Remarks are snapshots: they keep the text of a finding even after the hobit or principle
 * is re-run and says something else, because they are this MR's curated shortlist.
 */
export function RemarksSection({ review }: { review: MergeReviewDetailOut }) {
  const { t } = useTranslation();
  const { mutate: deleteRemark, isPending } = useDeleteRemarkMutation(
    review.id,
  );

  if (review.remarks.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border px-4 py-10 text-center">
        <StarIcon className="mx-auto size-5 text-muted-foreground/60" />
        <p className="mt-3 text-sm font-medium">
          {t("merge_reviews.remarks.empty_title")}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("merge_reviews.remarks.empty_body")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("merge_reviews.remarks.intro")}
      </p>
      <ul className="space-y-3">
        {review.remarks.map((remark) => (
          <li
            key={remark.id}
            className="flex items-start gap-3 rounded-md border border-border p-3"
          >
            {/* Hobit and principle severities are different vocabularies — each gets its
                own renderer. */}
            {remark.severity && remark.source_kind === "hobit" ? (
              <ReviewSeverityBadge
                severity={remark.severity}
                className="mt-0.5 shrink-0"
              />
            ) : null}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {remark.severity && remark.source_kind === "principle" ? (
                  <SeverityDot severity={remark.severity} />
                ) : null}
                <Badge variant="outline" className="text-xs">
                  {remark.source_label}
                </Badge>
                {remark.file ? (
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {remark.file}
                    {remark.line != null ? `:${remark.line}` : ""}
                  </span>
                ) : null}
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t("merge_reviews.remarks.kept_at", {
                    when: formatDateTime(remark.created_at),
                  })}
                </span>
              </div>
              <Markdown>{remark.text}</Markdown>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={isPending}
              onClick={() => deleteRemark(remark.id)}
              aria-label={t("merge_reviews.remarks.unstar")}
            >
              <XIcon className="size-3.5 text-muted-foreground" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
