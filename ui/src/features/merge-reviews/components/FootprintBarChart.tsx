import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import type { MergeReviewFootprint } from "@/lib/api";

const TOP_COUNT = 20;
const ROW_HEIGHT = 30;

interface Row {
  path: string;
  totalLoc: number;
  additions: number;
  deletions: number;
}

/**
 * The per-file footprint: horizontal grouped bars — one muted bar for the
 * file's total size (context) and a stacked additions+deletions bar for the
 * lines this MR touches. Long paths live on the y-axis; the container grows
 * with the row count instead of squeezing.
 */
export function FootprintBarChart({
  footprint,
}: {
  footprint: MergeReviewFootprint;
}) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo<Row[]>(
    () =>
      [...footprint.files]
        .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
        .map((f) => ({
          path: f.path,
          totalLoc: f.total_loc ?? 0,
          additions: f.additions,
          deletions: f.deletions,
        })),
    [footprint.files],
  );

  const visible = showAll ? rows : rows.slice(0, TOP_COUNT);
  const height = visible.length * ROW_HEIGHT + 60;

  return (
    <div className="space-y-2">
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={visible}
            layout="vertical"
            margin={{ top: 4, right: 12, left: 8, bottom: 0 }}
            barGap={1}
            barCategoryGap="22%"
          >
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={false}
              stroke="var(--border)"
            />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="path"
              width={230}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickFormatter={(v: string) =>
                v.length > 34 ? `…${v.slice(-33)}` : v
              }
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.4 }}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                fontSize: 12,
                color: "var(--popover-foreground)",
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              iconType="circle"
              iconSize={8}
            />
            <Bar
              dataKey="totalLoc"
              name={t("merge_reviews.footprint.total_loc")}
              fill="var(--muted-foreground)"
              opacity={0.35}
              radius={[0, 3, 3, 0]}
            />
            <Bar
              dataKey="additions"
              name={t("merge_reviews.footprint.additions")}
              stackId="changed"
              fill="var(--success)"
            />
            <Bar
              dataKey="deletions"
              name={t("merge_reviews.footprint.deletions")}
              stackId="changed"
              fill="var(--destructive)"
              radius={[0, 3, 3, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {rows.length > TOP_COUNT ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll
            ? t("merge_reviews.footprint.show_less", { count: TOP_COUNT })
            : t("merge_reviews.footprint.show_all", { count: rows.length })}
        </Button>
      ) : null}
    </div>
  );
}
