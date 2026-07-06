import type { LanguageStat } from "@/lib/api";
import { formatNumber } from "@/lib/format";

export function LanguageBars({
  languages,
  limit = 8,
}: {
  languages: LanguageStat[];
  limit?: number;
}) {
  const top = [...languages].sort((a, b) => b.pct - a.pct).slice(0, limit);

  if (top.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No language data available.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {top.map((lang) => (
        <div key={lang.language}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate font-medium">{lang.language}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {lang.pct.toFixed(1)}% · {formatNumber(lang.loc)} LOC
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-chart-3"
              style={{ width: `${Math.max(lang.pct, 1)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
