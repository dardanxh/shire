import { TrendingUpIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PromptMetricPoint } from "@/lib/api";
import { formatNumber, formatUsd } from "@/lib/format";
import { usePromptMetricsQuery } from "../api";
import { ScoreBadge } from "./ScoreBadge";

/**
 * The series, and why these five: the mechanical score, the four AI dimensions people actually ask
 * about, and the judge's verdict. Eight overlapping AI dimensions would be unreadable, so the rest
 * live on the Checks tab.
 *
 * `hallucination_risk` is inverted into "grounding" so every line on the chart means the same thing:
 * up is better. A chart where one series read backwards would be actively misleading.
 */
const SERIES = [
  { key: "static_score", colour: "var(--chart-1)" },
  { key: "accuracy", colour: "var(--chart-2)" },
  { key: "factfulness", colour: "var(--chart-3)" },
  { key: "grounding", colour: "var(--chart-4)" },
  { key: "judge_overall", colour: "var(--chart-5)" },
] as const;

interface ChartRow {
  label: string;
  static_score: number;
  accuracy: number | null;
  factfulness: number | null;
  grounding: number | null;
  judge_overall: number | null;
}

function toRows(points: PromptMetricPoint[]): ChartRow[] {
  return points.map((point) => ({
    label: `v${point.number}`,
    static_score: point.static_score,
    accuracy: point.accuracy,
    factfulness: point.factfulness,
    grounding:
      point.hallucination_risk === null ? null : 100 - point.hallucination_risk,
    judge_overall: point.judge_overall,
  }));
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
      {hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}

export function DashboardPanel({ promptId }: { promptId: string }) {
  const { t } = useTranslation();
  const { data, isPending } = usePromptMetricsQuery(promptId);

  const rows = useMemo(() => toRows(data?.points ?? []), [data]);
  const latest = data?.points[data.points.length - 1];
  const first = data?.points[0];

  if (isPending) {
    return <Skeleton className="h-80 w-full" />;
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {t("prompts.dashboard.empty")}
        </CardContent>
      </Card>
    );
  }

  const measuredRuns =
    data?.points.reduce((sum, p) => sum + p.run_count, 0) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-10 gap-y-4 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t("prompts.dashboard.first_last")}
            </span>
            <ScoreBadge score={first?.static_score} />
            <TrendingUpIcon className="size-4 text-muted-foreground" />
            <ScoreBadge score={latest?.static_score} />
          </div>
          <Stat
            label={t("prompts.dashboard.versions")}
            value={formatNumber(data?.points.length)}
          />
          <Stat
            label={t("prompts.dashboard.est_tokens")}
            value={formatNumber(latest?.estimated_input_tokens)}
          />
          {latest?.measured_input_tokens ? (
            <Stat
              label={t("prompts.dashboard.measured_tokens")}
              value={formatNumber(latest.measured_input_tokens)}
              hint={t("prompts.dashboard.measured_hint", {
                count: latest.run_count,
              })}
            />
          ) : null}
          {latest?.total_cost_usd !== null &&
          latest?.total_cost_usd !== undefined ? (
            <Stat
              label={t("prompts.dashboard.cost")}
              value={formatUsd(latest.total_cost_usd)}
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">
              {t("prompts.dashboard.trend")}
            </span>
            <Badge variant="outline">
              {t("prompts.dashboard.up_is_better")}
            </Badge>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={rows}
                margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--border)"
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={16}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    color: "var(--popover-foreground)",
                    fontSize: 12,
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value) => t(`prompts.dashboard.series.${value}`)}
                />
                {SERIES.map((series) => (
                  <Line
                    key={series.key}
                    type="monotone"
                    dataKey={series.key}
                    name={series.key}
                    stroke={series.colour}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    // Versions with no review or no arena run are gaps, not zeroes.
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground">
            {measuredRuns === 0
              ? t("prompts.dashboard.no_runs_yet")
              : t("prompts.dashboard.mixed_note")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
