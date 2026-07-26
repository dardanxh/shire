/**
 * Back-of-the-envelope data-system sizing math. Pure functions — the single source of
 * truth for the calculator (the backend only stores the inputs). All figures are rough
 * order-of-magnitude estimates, not capacity guarantees.
 */

export type IngestMode = "streaming" | "batch";

export interface SizingInputs {
  // Data & volume
  ingest_mode: IngestMode;
  new_records_per_day: number;
  avg_record_size_bytes: number;
  existing_data_gb: number;
  // Workload
  peak_to_avg_ratio: number;
  read_qps: number;
  avg_scan_gb_per_query: number;
  // Storage assumptions
  compression_ratio: number;
  replication_factor: number;
  copies: number;
  hot_retention_days: number;
  monthly_growth_pct: number;
  // Cost & capacity assumptions
  storage_cost_per_gb_month: number;
  compute_cost_per_node_month: number;
  per_node_ingest_mbps: number;
  per_partition_mbps: number;
  per_node_scan_gbps: number;
}

export type SizingRegime = "small" | "medium" | "big";

export interface SizingResults {
  storage: {
    rawPerDayGb: number;
    rawHotGb: number;
    compressedHotGb: number;
    storedHotGb: number;
    stored12moGb: number;
  };
  throughput: {
    avgMbps: number;
    peakMbps: number;
    avgRecordsPerSec: number;
    peakRecordsPerSec: number;
    partitions: number;
    brokers: number;
  };
  compute: {
    ingestNodes: number;
    queryNodes: number;
    totalNodes: number;
  };
  cost: {
    storageMonthly: number;
    computeMonthly: number;
    totalMonthly: number;
  };
  fit: {
    regime: SizingRegime;
    blueprintSlugs: string[];
    qualitySlugs: string[];
  };
}

export const SIZING_DEFAULTS: SizingInputs = {
  ingest_mode: "streaming",
  new_records_per_day: 100_000_000,
  avg_record_size_bytes: 500,
  existing_data_gb: 0,
  peak_to_avg_ratio: 3,
  read_qps: 50,
  avg_scan_gb_per_query: 1,
  compression_ratio: 4,
  replication_factor: 3,
  copies: 1,
  hot_retention_days: 90,
  monthly_growth_pct: 5,
  storage_cost_per_gb_month: 0.023,
  compute_cost_per_node_month: 400,
  per_node_ingest_mbps: 50,
  per_partition_mbps: 10,
  per_node_scan_gbps: 1,
};

const SECONDS_PER_DAY = 86_400;
const DAYS_PER_MONTH = 30;

const posInt = (n: number) => Math.max(1, Math.ceil(n));

export function computeSizing(inputs: SizingInputs): SizingResults {
  const rawPerDayGb =
    (inputs.new_records_per_day * inputs.avg_record_size_bytes) / 1e9;

  // Storage: hot window + a compounded 12-month projection.
  const rawHotGb =
    inputs.existing_data_gb + rawPerDayGb * inputs.hot_retention_days;
  const compressedHotGb = rawHotGb / inputs.compression_ratio;
  const storedHotGb =
    compressedHotGb * inputs.replication_factor * inputs.copies;

  const g = inputs.monthly_growth_pct / 100;
  let raw12moGb = inputs.existing_data_gb;
  for (let month = 0; month < 12; month += 1) {
    raw12moGb += rawPerDayGb * DAYS_PER_MONTH * (1 + g) ** month;
  }
  const stored12moGb =
    (raw12moGb / inputs.compression_ratio) *
    inputs.replication_factor *
    inputs.copies;

  // Throughput (MB/s): GB/day × 1000 MB/GB ÷ seconds/day.
  const avgMbps = (rawPerDayGb * 1000) / SECONDS_PER_DAY;
  const peakMbps = avgMbps * inputs.peak_to_avg_ratio;
  const avgRecordsPerSec = inputs.new_records_per_day / SECONDS_PER_DAY;
  const peakRecordsPerSec = avgRecordsPerSec * inputs.peak_to_avg_ratio;
  const partitions = posInt(peakMbps / inputs.per_partition_mbps);
  const brokers = posInt(partitions / 50); // ~50 partitions per broker rule of thumb

  // Compute: separate ingest and query serving, HA floor of 3.
  const ingestNodes = posInt(peakMbps / inputs.per_node_ingest_mbps);
  const queryNodes = posInt(
    (inputs.read_qps * inputs.avg_scan_gb_per_query) /
      inputs.per_node_scan_gbps,
  );
  const totalNodes = Math.max(3, ingestNodes + queryNodes);

  // Cost per month.
  const storageMonthly = storedHotGb * inputs.storage_cost_per_gb_month;
  const computeMonthly = totalNodes * inputs.compute_cost_per_node_month;

  return {
    storage: {
      rawPerDayGb,
      rawHotGb,
      compressedHotGb,
      storedHotGb,
      stored12moGb,
    },
    throughput: {
      avgMbps,
      peakMbps,
      avgRecordsPerSec,
      peakRecordsPerSec,
      partitions,
      brokers,
    },
    compute: { ingestNodes, queryNodes, totalNodes },
    cost: {
      storageMonthly,
      computeMonthly,
      totalMonthly: storageMonthly + computeMonthly,
    },
    fit: classifyFit(inputs, storedHotGb),
  };
}

/** Regime classification + a transparent map to matching blueprints and qualities. */
function classifyFit(
  inputs: SizingInputs,
  storedHotGb: number,
): SizingResults["fit"] {
  const regime: SizingRegime =
    storedHotGb < 1_000 ? "small" : storedHotGb < 100_000 ? "medium" : "big";
  const streaming = inputs.ingest_mode === "streaming";
  const highRead = inputs.read_qps >= 100;

  const blueprintSlugs: string[] = [];
  const qualitySlugs: string[] = [];

  if (regime === "small") {
    blueprintSlugs.push("small-data-duckdb-stack", "elt-modern-data-stack");
    qualitySlugs.push("cost-efficiency", "maintainability");
  } else if (streaming) {
    blueprintSlugs.push(
      "kappa-streaming-pipeline",
      "streaming-lakehouse",
      "real-time-analytics-serving",
    );
    qualitySlugs.push("latency", "throughput", "restartability");
  } else {
    blueprintSlugs.push(
      "medallion-lakehouse",
      "open-iceberg-lakehouse",
      "kimball-data-warehouse",
    );
    qualitySlugs.push("scalability", "cost-efficiency", "schema-evolvability");
  }
  if (highRead) {
    blueprintSlugs.push("real-time-analytics-serving", "embedded-analytics");
    qualitySlugs.push("availability");
  }

  return {
    regime,
    blueprintSlugs: [...new Set(blueprintSlugs)],
    qualitySlugs: [...new Set(qualitySlugs)],
  };
}
