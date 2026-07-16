import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ROADMAP_ITEM_STATUSES,
  type RoadmapDetailOut,
  type RoadmapItemOut,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { useRoadmapBurnupQuery, useRoadmapRadarQuery } from "../api";

const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  fontSize: 12,
  color: "var(--popover-foreground)",
} as const;

const AXIS_TICK = { fontSize: 11, fill: "var(--muted-foreground)" } as const;

const STATUS_COLORS: Record<string, string> = {
  todo: "var(--chart-5)",
  in_progress: "var(--chart-3)",
  done: "var(--chart-1)",
};

const REPO_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/** Burnup + per-label / per-repo breakdowns + the per-repo health radar. */
export function InsightsPanel({ roadmap }: { roadmap: RoadmapDetailOut }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="gap-3 p-4 lg:col-span-2">
        <h3 className="text-sm font-semibold">
          {t("roadmaps.insights.burnup_title")}
        </h3>
        <BurnupChart roadmapId={roadmap.id} />
      </Card>
      <Card className="gap-3 p-4">
        <h3 className="text-sm font-semibold">
          {t("roadmaps.insights.by_label_title")}
        </h3>
        <BreakdownBars
          items={roadmap.items}
          keyOf={(item) => item.label}
          labelOf={(key) => t(`roadmaps.label.${key}`, { defaultValue: key })}
        />
      </Card>
      <Card className="gap-3 p-4">
        <h3 className="text-sm font-semibold">
          {t("roadmaps.insights.by_repo_title")}
        </h3>
        <BreakdownBars
          items={roadmap.items}
          keyOf={(item) => item.repository_id ?? "__portfolio__"}
          labelOf={(key) =>
            key === "__portfolio__"
              ? t("roadmaps.items.portfolio_wide")
              : (roadmap.repositories.find((r) => r.id === key)?.name ?? "—")
          }
        />
      </Card>
      <Card className="gap-3 p-4 lg:col-span-2">
        <h3 className="text-sm font-semibold">
          {t("roadmaps.insights.radar_title")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t("roadmaps.insights.radar_subtitle")}
        </p>
        <HealthRadar roadmap={roadmap} />
      </Card>
    </div>
  );
}

function BurnupChart({ roadmapId }: { roadmapId: string }) {
  const { t } = useTranslation();
  const { data, isPending } = useRoadmapBurnupQuery(roadmapId);

  if (isPending) return <Skeleton className="h-64 w-full" />;
  const series = data?.series ?? [];
  if (series.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {t("roadmaps.insights.burnup_empty")}
      </p>
    );
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={series}
          margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
        >
          <defs>
            <linearGradient id="burnupDone" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
              <stop
                offset="100%"
                stopColor="var(--chart-1)"
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
            dataKey="day"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
          />
          <YAxis
            allowDecimals={false}
            width={36}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            contentStyle={TOOLTIP_STYLE}
          />
          <Area
            type="monotone"
            dataKey="done"
            name={t("roadmaps.insights.burnup_done")}
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#burnupDone)"
          />
          <Line
            type="monotone"
            dataKey="total"
            name={t("roadmaps.insights.burnup_total")}
            stroke="var(--muted-foreground)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function BreakdownBars({
  items,
  keyOf,
  labelOf,
}: {
  items: RoadmapItemOut[];
  keyOf: (item: RoadmapItemOut) => string;
  labelOf: (key: string) => string;
}) {
  const { t } = useTranslation();
  const data = useMemo(() => {
    const byKey = new Map<string, Record<string, number>>();
    for (const item of items) {
      const key = keyOf(item);
      const bucket = byKey.get(key) ?? {};
      bucket[item.status] = (bucket[item.status] ?? 0) + 1;
      byKey.set(key, bucket);
    }
    return [...byKey.entries()]
      .map(([key, counts]) => ({
        label: labelOf(key),
        total: Object.values(counts).reduce((a, b) => a + b, 0),
        ...counts,
      }))
      .sort((a, b) => b.total - a.total);
  }, [items, keyOf, labelOf]);

  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {t("roadmaps.items.empty")}
      </p>
    );
  }
  return (
    <div style={{ height: Math.max(160, data.length * 36) }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 12, left: 8, bottom: 0 }}
        >
          <XAxis
            type="number"
            allowDecimals={false}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={110}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={TOOLTIP_STYLE}
          />
          {ROADMAP_ITEM_STATUSES.map((status) => (
            <Bar
              key={status}
              dataKey={status}
              name={t(`roadmaps.item_status.${status}`)}
              stackId="statuses"
              fill={STATUS_COLORS[status]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function HealthRadar({ roadmap }: { roadmap: RoadmapDetailOut }) {
  const { t } = useTranslation();
  const { data, isPending } = useRoadmapRadarQuery(roadmap.id);
  const assessments = data?.current ?? roadmap.assessments;
  const named = assessments.filter((a) => a.repo);
  // Radar readability degrades fast past a few overlaid shapes — default to the first 3.
  const [visible, setVisible] = useState<Set<string> | null>(null);
  const shown = visible ?? new Set(named.slice(0, 3).map((a) => a.repo ?? ""));

  const chartData = useMemo(() => {
    const dimensions = [
      ...new Set(named.flatMap((a) => Object.keys(a.scores))),
    ];
    return dimensions.map((dimension) => {
      const point: Record<string, string | number> = {
        dimension: t(`roadmaps.health.${dimension}`, {
          defaultValue: dimension.replace(/_/g, " "),
        }),
      };
      for (const assessment of named) {
        const repo = assessment.repo ?? "";
        if (shown.has(repo)) point[repo] = assessment.scores[dimension] ?? 0;
      }
      return point;
    });
  }, [named, shown, t]);

  if (isPending) return <Skeleton className="h-72 w-full" />;
  if (named.length === 0 || chartData.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {t("roadmaps.insights.radar_empty")}
      </p>
    );
  }

  const toggle = (repo: string) =>
    setVisible(() => {
      const next = new Set(shown);
      if (next.has(repo)) next.delete(repo);
      else next.add(repo);
      return next;
    });

  return (
    <div className="space-y-2">
      {named.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {named.map((assessment, index) => {
            const repo = assessment.repo ?? "";
            const active = shown.has(repo);
            return (
              <button
                key={repo}
                type="button"
                onClick={() => toggle(repo)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  active
                    ? "border-primary/50 text-foreground"
                    : "border-border text-muted-foreground opacity-60 hover:bg-muted",
                )}
              >
                <span
                  className="size-2 rounded-full"
                  style={{
                    background: REPO_COLORS[index % REPO_COLORS.length],
                  }}
                />
                {repo}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={chartData} outerRadius="75%">
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis dataKey="dimension" tick={AXIS_TICK} />
            <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            {named.map((assessment, index) => {
              const repo = assessment.repo ?? "";
              if (!shown.has(repo)) return null;
              const color = REPO_COLORS[index % REPO_COLORS.length];
              return (
                <Radar
                  key={repo}
                  name={repo}
                  dataKey={repo}
                  stroke={color}
                  fill={color}
                  fillOpacity={0.12}
                />
              );
            })}
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
