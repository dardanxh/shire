"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CommitActivity } from "@/lib/api";

interface Point {
  label: string;
  count: number;
}

// Aggregate daily activity into monthly buckets when the range is large.
function aggregate(activity: CommitActivity[]): {
  data: Point[];
  granularity: "day" | "month";
} {
  const sorted = [...activity].sort((a, b) => a.day.localeCompare(b.day));

  if (sorted.length <= 60) {
    return {
      granularity: "day",
      data: sorted.map((a) => ({ label: a.day, count: a.count })),
    };
  }

  const byMonth = new Map<string, number>();
  for (const a of sorted) {
    const key = a.day.slice(0, 7); // YYYY-MM
    byMonth.set(key, (byMonth.get(key) ?? 0) + a.count);
  }
  return {
    granularity: "month",
    data: Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, count]) => ({ label, count })),
  };
}

export function CommitsChart({ activity }: { activity: CommitActivity[] }) {
  const { data, granularity } = useMemo(() => aggregate(activity), [activity]);

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No commit activity available.
      </p>
    );
  }

  const formatLabel = (v: string) =>
    granularity === "month"
      ? new Date(`${v}-01`).toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
        })
      : v;

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
        >
          <defs>
            <linearGradient id="commitsFill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--chart-3)"
                stopOpacity={0.5}
              />
              <stop
                offset="100%"
                stopColor="var(--chart-3)"
                stopOpacity={0.04}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="var(--border)"
          />
          <XAxis
            dataKey="label"
            tickFormatter={formatLabel}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            allowDecimals={false}
            width={36}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            labelFormatter={(l) => formatLabel(String(l))}
            formatter={(value) => [value as number, "commits"]}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              fontSize: 12,
              color: "var(--popover-foreground)",
            }}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="var(--chart-3)"
            strokeWidth={2}
            fill="url(#commitsFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
