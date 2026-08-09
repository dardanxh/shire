import { useTranslation } from "react-i18next";

import { Card } from "@/components/ui/card";
import { formatTokens } from "@/features/jobs/components/JobsListPage";
import type { TreasuryOverviewOut } from "@/lib/api";

/**
 * The month's headline numbers, side by side and honestly labeled: the machine-wide figure
 * is an estimate (tokens x pricing — Claude's local data carries no cost), Shire's figure
 * is actual (from the CLI envelope, per job). The share is a comparison of the two, not an
 * exact fraction — depending on deployment, Shire's runs may or may not appear in the
 * machine's transcripts at all.
 */
export function MonthSpendCards({
  overview,
}: {
  overview: TreasuryOverviewOut;
}) {
  const { t } = useTranslation();
  const { month, lifetime } = overview;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Card className="gap-1 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("treasury.month.machine_title", { month: month.month })}
        </p>
        {month.machine_cost_usd_estimated != null ? (
          <>
            <p className="text-xl font-semibold tabular-nums">
              ${month.machine_cost_usd_estimated.toFixed(2)}
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                {t("treasury.month.estimated")}
              </span>
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {t("treasury.month.machine_line", {
                tokens: formatTokens(month.machine_total_tokens),
              })}
            </p>
            {month.unknown_models.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("treasury.month.unknown_models", {
                  models: month.unknown_models.join(", "),
                })}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("treasury.month.machine_unavailable")}
          </p>
        )}
      </Card>

      <Card className="gap-1 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("treasury.month.shire_title")}
        </p>
        <p className="text-xl font-semibold tabular-nums">
          ${month.shire_cost_usd.toFixed(2)}
          <span className="ml-1.5 text-sm font-normal text-muted-foreground">
            {t("treasury.month.actual")}
          </span>
        </p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {t("treasury.month.shire_line", {
            tokens: formatTokens(month.shire_total_tokens),
            jobs: month.shire_jobs,
          })}
        </p>
      </Card>

      <Card className="gap-1 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("treasury.month.share_title")}
        </p>
        <p className="text-xl font-semibold tabular-nums">
          {month.share_pct != null ? `${month.share_pct}%` : "—"}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("treasury.month.share_caveat")}
        </p>
        {lifetime ? (
          <p className="text-xs tabular-nums text-muted-foreground">
            {t("treasury.month.lifetime_line", {
              cost: lifetime.machine_cost_usd_estimated.toFixed(0),
              tokens: formatTokens(lifetime.machine_total_tokens),
              date: lifetime.as_of ?? "?",
            })}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
