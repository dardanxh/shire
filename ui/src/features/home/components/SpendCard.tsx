import { Link } from "@tanstack/react-router";
import { CoinsIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useJobsStatsQuery } from "@/features/jobs/api";
import { formatTokens } from "@/features/jobs/components/JobsListPage";

/** The engine's running cost: today / 7 days / all time, straight from the jobs stats. */
export function SpendCard() {
  const { t } = useTranslation();
  const { data: stats, isPending } = useJobsStatsQuery();

  return (
    <Card className="gap-3 p-5">
      <div className="flex items-center gap-2">
        <CoinsIcon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{t("home.spend.title")}</h2>
        <Link
          to="/jobs"
          search={{ tab: "runs", status: undefined, page: 1, size: 20 }}
          className="ml-auto text-xs font-medium text-primary hover:underline"
        >
          {t("home.spend.view_jobs")}
        </Link>
      </div>

      {isPending || !stats ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {(
            [
              ["today", stats.today],
              ["week", stats.last_7_days],
              ["all_time", stats.all_time],
            ] as const
          ).map(([key, bucket]) => (
            <div key={key}>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t(`home.spend.${key}`)}
              </p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">
                ${bucket.total_cost_usd.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("home.spend.detail", {
                  jobs: bucket.jobs,
                  tokens: formatTokens(bucket.total_tokens),
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
