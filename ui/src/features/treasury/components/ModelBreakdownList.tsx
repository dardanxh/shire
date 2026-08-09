import { useTranslation } from "react-i18next";

import { formatTokens } from "@/features/jobs/components/JobsListPage";
import type { ModelBreakdownOut } from "@/lib/api";

/** Per-model sums for the window — a compact list; the chart above carries the story. */
export function ModelBreakdownList({ rows }: { rows: ModelBreakdownOut[] }) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;

  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {rows.map((row) => (
        <li
          key={row.model}
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
        >
          <span className="font-mono text-xs">{row.model}</span>
          <span className="tabular-nums text-muted-foreground">
            {t("treasury.models.line", {
              jobs: row.jobs,
              tokens: formatTokens(row.total_tokens),
              cost: row.cost_usd.toFixed(2),
            })}
          </span>
        </li>
      ))}
    </ul>
  );
}
