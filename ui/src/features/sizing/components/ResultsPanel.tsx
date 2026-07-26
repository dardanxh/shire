import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  formatBytesFromGB,
  formatCompact,
  formatCurrency,
  formatMbps,
  formatNumber,
} from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { SizingInputs, SizingResults } from "../calc";
import { NUMERIC_FIELD_KEYS } from "../schemas";
import { ArchitectureFit } from "./ArchitectureFit";

export function ResultsPanel({
  results,
  inputs,
}: {
  results: SizingResults;
  inputs: SizingInputs;
}) {
  const { t } = useTranslation();
  const { storage, throughput, compute, cost } = results;

  return (
    <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">{t("sizing.results_title")}</h2>
        <span className="text-xs text-muted-foreground">
          {t("sizing.disclaimer")}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ResultCard title={t("sizing.result.storage")}>
          <Metric
            label={t("sizing.result.stored")}
            value={formatBytesFromGB(storage.storedHotGb)}
            primary
          />
          <Metric
            label={t("sizing.result.raw_per_day")}
            value={formatBytesFromGB(storage.rawPerDayGb)}
          />
          <Metric
            label={t("sizing.result.compressed")}
            value={formatBytesFromGB(storage.compressedHotGb)}
          />
          <Metric
            label={t("sizing.result.stored_12mo")}
            value={formatBytesFromGB(storage.stored12moGb)}
          />
          <StorageBar results={results} />
        </ResultCard>

        <ResultCard title={t("sizing.result.throughput")}>
          <Metric
            label={t("sizing.result.avg_throughput")}
            value={formatMbps(throughput.avgMbps)}
            primary
          />
          <Metric
            label={t("sizing.result.peak_throughput")}
            value={formatMbps(throughput.peakMbps)}
          />
          <Metric
            label={t("sizing.result.peak_records")}
            value={`${formatCompact(throughput.peakRecordsPerSec)}/s`}
          />
          <Metric
            label={t("sizing.result.partitions")}
            value={formatNumber(throughput.partitions)}
          />
          <Metric
            label={t("sizing.result.brokers")}
            value={formatNumber(throughput.brokers)}
          />
        </ResultCard>

        <ResultCard title={t("sizing.result.compute")}>
          <Metric
            label={t("sizing.result.total_nodes")}
            value={formatNumber(compute.totalNodes)}
            primary
          />
          <Metric
            label={t("sizing.result.ingest_nodes")}
            value={formatNumber(compute.ingestNodes)}
          />
          <Metric
            label={t("sizing.result.query_nodes")}
            value={formatNumber(compute.queryNodes)}
          />
        </ResultCard>

        <ResultCard title={t("sizing.result.cost")}>
          <Metric
            label={t("sizing.result.total_cost")}
            value={formatCurrency(cost.totalMonthly)}
            primary
          />
          <Metric
            label={t("sizing.result.storage_cost")}
            value={formatCurrency(cost.storageMonthly)}
          />
          <Metric
            label={t("sizing.result.compute_cost")}
            value={formatCurrency(cost.computeMonthly)}
          />
        </ResultCard>
      </div>

      <ArchitectureFit fit={results.fit} />
      <AssumptionsDisclosure inputs={inputs} />
    </div>
  );
}

function ResultCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Metric({
  label,
  value,
  primary = false,
}: {
  label: string;
  value: string;
  primary?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono tabular-nums",
          primary ? "text-lg font-semibold" : "text-sm",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** Raw → compressed → stored as proportional bars (no chart lib). */
function StorageBar({ results }: { results: SizingResults }) {
  const { t } = useTranslation();
  const { rawHotGb, compressedHotGb, storedHotGb } = results.storage;
  const max = Math.max(rawHotGb, compressedHotGb, storedHotGb, 1);
  const rows = [
    { key: "raw", value: rawHotGb, color: "bg-sky-500" },
    { key: "compressed", value: compressedHotGb, color: "bg-violet-500" },
    { key: "stored", value: storedHotGb, color: "bg-emerald-500" },
  ];
  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t pt-3">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-xs text-muted-foreground">
            {t(`sizing.storage_bar.${row.key}`)}
          </span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", row.color)}
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
            />
          </div>
          <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums">
            {formatBytesFromGB(row.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function AssumptionsDisclosure({ inputs }: { inputs: SizingInputs }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex items-center justify-between text-sm font-medium"
      >
        {t("sizing.assumptions.title")}
        <ChevronDownIcon
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {NUMERIC_FIELD_KEYS.map((key) => (
            <div key={key} className="flex justify-between gap-2">
              <dt className="truncate text-muted-foreground">
                {t(`sizing.field.${key}`)}
              </dt>
              <dd className="font-mono tabular-nums">
                {formatNumber(inputs[key], inputs[key] % 1 === 0 ? 0 : 3)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
