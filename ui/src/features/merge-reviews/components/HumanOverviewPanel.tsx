import { SparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Markdown } from "@/components/shared/Markdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { MergeReviewDetailOut } from "@/lib/api";
import { SectionShell } from "./SectionShell";

/**
 * Layer 3 — "MR overview for humans": the AI's prose account of what the
 * changes do. Read-only; generation is implicit (the background pipeline).
 */
export function HumanOverviewPanel({
  review,
}: {
  review: MergeReviewDetailOut;
}) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SparklesIcon className="size-4 text-primary" />
          {t("merge_reviews.overview.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <SectionShell
          status={review.overview_status}
          skeleton={
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {t("merge_reviews.overview.pending")}
              </p>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          }
        >
          {/* The engine writes this as Markdown (see mr_hobit's overview prompt) — render it,
              don't print the source. */}
          <Markdown className="text-foreground/90">
            {review.overview_markdown ?? ""}
          </Markdown>
        </SectionShell>
      </CardContent>
    </Card>
  );
}
