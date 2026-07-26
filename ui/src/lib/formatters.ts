/** Human-readable formatting helpers (no dependency; `Intl.NumberFormat` under the hood). */

const BYTE_UNITS = ["GB", "TB", "PB", "EB"] as const;

/** A GB value scaled to the largest sensible unit: 2048 → "2 TB", 0.5 → "512 MB". */
export function formatBytesFromGB(gb: number): string {
  if (!Number.isFinite(gb) || gb <= 0) return "0 GB";
  if (gb < 1) return `${formatNumber(gb * 1024, 0)} MB`;
  let value = gb;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${formatNumber(value, value < 10 ? 1 : 0)} ${BYTE_UNITS[unit]}`;
}

/** Thousands-separated number with a fixed number of decimals. */
export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Compact magnitude: 1_500_000 → "1.5M", 2_300 → "2.3K". */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** USD with cents dropped above $100 for readability. */
export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

/** Throughput in MB/s, scaling to GB/s past 1000. */
export function formatMbps(mbps: number): string {
  if (!Number.isFinite(mbps) || mbps <= 0) return "0 MB/s";
  if (mbps >= 1000) return `${formatNumber(mbps / 1000, 2)} GB/s`;
  return `${formatNumber(mbps, mbps < 10 ? 2 : 0)} MB/s`;
}
