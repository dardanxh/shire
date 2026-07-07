import { useTranslation } from "react-i18next";

import type { Enrichment } from "@/lib/api";
import { formatNumber, formatUsd } from "@/lib/format";
import { FactCard } from "./FactCard";

function dash(n: number | null | undefined): string {
  return n == null ? "—" : formatNumber(n);
}

export function EnrichmentCards({ enrichment }: { enrichment: Enrichment }) {
  const { t } = useTranslation();
  const e = enrichment;
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <FactCard
        label={t("repositories.view.enrichment.cost")}
        value={formatUsd(e.cocomo_cost_usd)}
        sub={
          e.schedule_months == null
            ? undefined
            : t("repositories.view.enrichment.cost_sub", {
                months: Math.round(e.schedule_months),
              })
        }
      />
      <FactCard
        label={t("repositories.view.enrichment.complexity")}
        value={e.ccn_average == null ? "—" : e.ccn_average.toFixed(1)}
        sub={t("repositories.view.enrichment.complexity_sub", {
          max: dash(e.ccn_max),
          high: dash(e.high_complexity_count),
        })}
      />
      <FactCard
        label={t("repositories.view.enrichment.maintainability_index")}
        value={
          e.maintainability_index == null
            ? "—"
            : t("repositories.view.enrichment.maintainability_value", {
                value: Math.round(e.maintainability_index),
              })
        }
      />
      <FactCard
        label={t("repositories.view.enrichment.sbom")}
        value={dash(e.sbom_package_count)}
      />
    </section>
  );
}
