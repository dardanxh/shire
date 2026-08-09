import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTreasuryBreakdownQuery, useTreasuryOverviewQuery } from "../api";
import type { TreasuryWindow } from "../keys";
import { ActionBreakdownChart } from "./ActionBreakdownChart";
import { ModelBreakdownList } from "./ModelBreakdownList";
import { MonthSpendCards } from "./MonthSpendCards";
import { SubscriptionCard } from "./SubscriptionCard";

const WINDOWS: TreasuryWindow[] = ["7d", "30d", "month", "all"];

/**
 * The Treasury: what Claude costs. Top-down — whose subscription this machine runs on,
 * this month's machine-wide spend next to Shire's share, then the per-action breakdown
 * that answers "which button is eating my budget".
 */
export function TreasuryPage({
  window,
  onWindowChange,
}: {
  window: TreasuryWindow;
  onWindowChange: (next: TreasuryWindow) => void;
}) {
  const { t } = useTranslation();
  const { data: overview, isPending: isOverviewPending } =
    useTreasuryOverviewQuery();
  const { data: breakdown, isPending: isBreakdownPending } =
    useTreasuryBreakdownQuery(window);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("treasury.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("treasury.subtitle")}
        </p>
      </div>

      {isOverviewPending || !overview ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </div>
      ) : (
        <>
          <SubscriptionCard overview={overview} />
          <MonthSpendCards overview={overview} />
        </>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">
              {t("treasury.breakdown.title")}
            </CardTitle>
            <div className="flex items-center gap-1">
              {WINDOWS.map((option) => (
                <Button
                  key={option}
                  variant="ghost"
                  size="sm"
                  onClick={() => onWindowChange(option)}
                  className={cn(
                    "text-xs",
                    window === option
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {t(`treasury.windows.${option}`)}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isBreakdownPending || !breakdown ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-6 w-3/5" />
            </div>
          ) : (
            <>
              <ActionBreakdownChart rows={breakdown.kinds} />
              <ModelBreakdownList rows={breakdown.models} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
