import { z } from "zod";

import { SIZING_DEFAULTS, type SizingInputs } from "./calc";

export const INGEST_MODES = ["streaming", "batch"] as const;

/** A numeric input field and how it renders (label/description come from i18n by key). */
export interface SizingField {
  key: keyof SizingInputs;
  step?: number;
  min?: number;
}

/** Grouped input sections for the calculator form (labels via `sizing.section.*`). */
export const INPUT_SECTIONS: {
  key: string;
  fields: SizingField[];
}[] = [
  {
    key: "volume",
    fields: [
      // ingest_mode is a select, handled separately in the section renderer.
      { key: "new_records_per_day", step: 1_000_000 },
      { key: "avg_record_size_bytes", step: 50 },
      { key: "existing_data_gb", step: 100 },
    ],
  },
  {
    key: "workload",
    fields: [
      { key: "peak_to_avg_ratio", step: 0.5, min: 1 },
      { key: "read_qps", step: 10 },
      { key: "avg_scan_gb_per_query", step: 0.1 },
    ],
  },
  {
    key: "storage",
    fields: [
      { key: "compression_ratio", step: 0.5, min: 0.1 },
      { key: "replication_factor", step: 1, min: 1 },
      { key: "copies", step: 1, min: 1 },
      { key: "hot_retention_days", step: 30 },
      { key: "monthly_growth_pct", step: 1 },
    ],
  },
  {
    key: "cost",
    fields: [
      { key: "storage_cost_per_gb_month", step: 0.005 },
      { key: "compute_cost_per_node_month", step: 50 },
      { key: "per_node_ingest_mbps", step: 10, min: 1 },
      { key: "per_partition_mbps", step: 5, min: 1 },
      { key: "per_node_scan_gbps", step: 0.5, min: 0.1 },
    ],
  },
];

/** The numeric input keys, in section order (ingest_mode excluded — it's a select). */
export const NUMERIC_FIELD_KEYS = INPUT_SECTIONS.flatMap((section) =>
  section.fields.map((field) => field.key),
) as Exclude<keyof SizingInputs, "ingest_mode">[];

const num = (key: Exclude<keyof SizingInputs, "ingest_mode">) =>
  z.coerce.number().catch(SIZING_DEFAULTS[key]);

/** URL search schema: every input plus optional scenario/project for deep-loading. */
export const sizingSearchSchema = z.object({
  ingest_mode: z.enum(INGEST_MODES).catch(SIZING_DEFAULTS.ingest_mode),
  new_records_per_day: num("new_records_per_day"),
  avg_record_size_bytes: num("avg_record_size_bytes"),
  existing_data_gb: num("existing_data_gb"),
  peak_to_avg_ratio: num("peak_to_avg_ratio"),
  read_qps: num("read_qps"),
  avg_scan_gb_per_query: num("avg_scan_gb_per_query"),
  compression_ratio: num("compression_ratio"),
  replication_factor: num("replication_factor"),
  copies: num("copies"),
  hot_retention_days: num("hot_retention_days"),
  monthly_growth_pct: num("monthly_growth_pct"),
  storage_cost_per_gb_month: num("storage_cost_per_gb_month"),
  compute_cost_per_node_month: num("compute_cost_per_node_month"),
  per_node_ingest_mbps: num("per_node_ingest_mbps"),
  per_partition_mbps: num("per_partition_mbps"),
  per_node_scan_gbps: num("per_node_scan_gbps"),
  project: z.string().optional().catch(undefined),
  scenario: z.string().optional().catch(undefined),
});

export type SizingSearch = z.infer<typeof sizingSearchSchema>;

/** Pull just the calculator inputs out of the full search object. */
export function searchToInputs(search: SizingSearch): SizingInputs {
  const inputs = { ingest_mode: search.ingest_mode } as SizingInputs;
  for (const key of NUMERIC_FIELD_KEYS) {
    inputs[key] = Number(search[key]);
  }
  return inputs;
}
