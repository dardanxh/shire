import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { MergeReviewDetailOut } from "@/lib/api";
import { SectionShell } from "./SectionShell";

/** One fixed color per label so the proportion bar reads consistently. Every label gets its
 * own hue — chart-2 and chart-4 are both green, so only one label may use a green. */
const LABEL_COLORS: Record<string, string> = {
  bug_fix: "var(--chart-5)", // red
  new_feature: "var(--chart-1)", // blue
  refactoring: "var(--chart-6)", // purple
  docs: "var(--chart-3)", // amber
  tests: "var(--success)", // green
  chore: "var(--muted-foreground)", // grey
  config: "var(--warning)", // orange
};

/** Layer 2 — what kind of change is this? Multi-label with proportions. */
export function ClassificationBadges({
  review,
}: {
  review: MergeReviewDetailOut;
}) {
  const { t } = useTranslation();
  const labels = review.classification ?? [];

  return (
    <Card>
      <CardContent className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("merge_reviews.classification.title")}
        </p>
        <SectionShell
          status={review.classification_status}
          skeleton={
            <div className="space-y-2">
              <Skeleton className="h-2.5 w-full rounded-full" />
              <Skeleton className="h-5 w-48" />
            </div>
          }
        >
          {labels.length > 1 ? (
            <div className="flex h-2.5 w-full overflow-hidden rounded-full">
              {labels.map((entry) => (
                <div
                  key={entry.label}
                  style={{
                    width: `${entry.proportion * 100}%`,
                    background:
                      LABEL_COLORS[entry.label] ?? "var(--muted-foreground)",
                  }}
                />
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {labels.map((entry) => (
              <Badge key={entry.label} variant="secondary" className="gap-1.5">
                <span
                  className="size-2 rounded-full"
                  style={{
                    background:
                      LABEL_COLORS[entry.label] ?? "var(--muted-foreground)",
                  }}
                />
                {t(`merge_reviews.classification.${entry.label}`)}
                <span className="tabular-nums text-muted-foreground">
                  {Math.round(entry.proportion * 100)}%
                </span>
              </Badge>
            ))}
          </div>
        </SectionShell>
      </CardContent>
    </Card>
  );
}
