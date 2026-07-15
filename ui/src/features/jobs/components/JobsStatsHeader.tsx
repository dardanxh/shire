import { useTranslation } from "react-i18next";

import { Card } from "@/components/ui/card";
import type { JobStatsOut } from "@/lib/api";
import { useJobsStatsQuery } from "../api";
import { formatTokens } from "./JobsListPage";

type Bucket = JobStatsOut["today"];

export function JobsStatsHeader() {
  const { t } = useTranslation();
  const { data: stats } = useJobsStatsQuery();
  if (!stats) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard label={t("jobs.stats.today")} bucket={stats.today} />
      <StatCard
        label={t("jobs.stats.last_7_days")}
        bucket={stats.last_7_days}
      />
      <StatCard label={t("jobs.stats.all_time")} bucket={stats.all_time} />
    </div>
  );
}

function StatCard({ label, bucket }: { label: string; bucket: Bucket }) {
  const { t } = useTranslation();
  return (
    <Card className="gap-1 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-xl font-semibold tabular-nums">
        {formatTokens(bucket.total_tokens)}
        <span className="ml-1 text-sm font-normal text-muted-foreground">
          {t("jobs.stats.tokens")}
        </span>
      </p>
      <p className="text-xs tabular-nums text-muted-foreground">
        {t("jobs.stats.line", {
          jobs: bucket.jobs,
          cost: bucket.total_cost_usd.toFixed(2),
        })}
      </p>
    </Card>
  );
}
