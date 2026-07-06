import { FactCard } from "@/components/FactCard";
import type { Enrichment } from "@/lib/api";
import { formatNumber, formatUsd } from "@/lib/format";

function dash(n: number | null | undefined): string {
  return n == null ? "—" : formatNumber(n);
}

export function EnrichmentCards({ enrichment }: { enrichment: Enrichment }) {
  const e = enrichment;
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <FactCard
        label="Est. cost (COCOMO)"
        value={formatUsd(e.cocomo_cost_usd)}
        sub={
          e.schedule_months == null
            ? undefined
            : `~${Math.round(e.schedule_months)} months`
        }
      />
      <FactCard
        label="Complexity (avg CCN)"
        value={e.ccn_average == null ? "—" : e.ccn_average.toFixed(1)}
        sub={`max ${dash(e.ccn_max)} · ${dash(e.high_complexity_count)} high`}
      />
      <FactCard
        label="Maintainability index"
        value={
          e.maintainability_index == null
            ? "—"
            : `${Math.round(e.maintainability_index)}/100`
        }
      />
      <FactCard label="SBOM packages" value={dash(e.sbom_package_count)} />
    </section>
  );
}
