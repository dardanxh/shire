export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Human-friendly age from age_days, e.g. "~11 years", "~3 months", "5 days". */
export function formatAge(ageDays: number | null | undefined): string {
  if (ageDays == null) return "—";
  if (ageDays < 1) return "today";
  if (ageDays < 60) return `${Math.round(ageDays)} days`;
  const months = ageDays / 30.44;
  if (months < 24) return `~${Math.round(months)} months`;
  const years = ageDays / 365.25;
  return `~${Math.round(years)} year${Math.round(years) === 1 ? "" : "s"}`;
}

/** Compact USD, e.g. "$1.2M", "$45.0K", "$820". */
export function formatUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

export function shortSha(sha: string | null | undefined): string {
  if (!sha) return "—";
  return sha.slice(0, 7);
}
