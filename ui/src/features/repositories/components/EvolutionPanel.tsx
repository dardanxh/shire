import { useQueryClient } from "@tanstack/react-query";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { Markdown } from "@/components/shared/Markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTrackedJob } from "@/features/jobs";
import type { AnalysisDeltaOut, AnalysisSnapshotOut } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  useAnalysisDeltaQuery,
  useAnalysisHistoryQuery,
  useExplainDeltaMutation,
} from "../api";
import { repositoryKeys } from "../keys";

const CHART_TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  fontSize: 12,
  color: "var(--popover-foreground)",
} as const;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function shortSha(sha: string): string {
  return sha.slice(0, 8);
}

/** One small trend chart over the snapshot history. */
function TrendChart({
  history,
  metric,
  label,
}: {
  history: AnalysisSnapshotOut[];
  metric: (snapshot: AnalysisSnapshotOut) => number | null;
  label: string;
}) {
  const data = history
    .map((snapshot) => ({
      label: snapshot.analyzed_at,
      value: metric(snapshot),
    }))
    .filter((point) => point.value != null);
  if (data.length < 2) {
    return null;
  }
  return (
    <Card className="gap-2 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="var(--border)"
            />
            <XAxis
              dataKey="label"
              tickFormatter={formatDate}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
            />
            <YAxis
              width={40}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              labelFormatter={(value) => formatDate(String(value))}
              formatter={(value) => [value as number, label]}
              contentStyle={CHART_TOOLTIP_STYLE}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--chart-3)"
              strokeWidth={2}
              fill="var(--chart-3)"
              fillOpacity={0.15}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/** Headline chips for one snapshot vs its predecessor. */
function SnapshotChips({
  snapshot,
  previous,
}: {
  snapshot: AnalysisSnapshotOut;
  previous: AnalysisSnapshotOut | undefined;
}) {
  const { t } = useTranslation();
  if (!previous) {
    return (
      <Badge variant="outline" className="text-[10px]">
        {t("repositories.view.evolution.baseline")}
      </Badge>
    );
  }
  const chips: { key: string; text: string; tone: "up" | "down" | "flat" }[] =
    [];
  const locDelta = snapshot.loc_total - previous.loc_total;
  if (locDelta !== 0) {
    chips.push({
      key: "loc",
      text: `${locDelta > 0 ? "+" : ""}${locDelta} LOC`,
      tone: "flat",
    });
  }
  const commitDelta = snapshot.commit_count - previous.commit_count;
  if (commitDelta !== 0) {
    chips.push({
      key: "commits",
      text: t("repositories.view.evolution.chip_commits", {
        count: commitDelta,
      }),
      tone: "flat",
    });
  }
  const depDelta = snapshot.dependency_count - previous.dependency_count;
  if (depDelta !== 0) {
    chips.push({
      key: "deps",
      text: `${depDelta > 0 ? "+" : ""}${depDelta} deps`,
      tone: "flat",
    });
  }
  if (snapshot.vulnerability_count !== previous.vulnerability_count) {
    chips.push({
      key: "vulns",
      text: `vulns ${previous.vulnerability_count}→${snapshot.vulnerability_count}`,
      tone:
        snapshot.vulnerability_count > previous.vulnerability_count
          ? "up"
          : "down",
    });
  }
  if (snapshot.rating_health !== previous.rating_health) {
    chips.push({
      key: "health",
      text: `health ${previous.rating_health}→${snapshot.rating_health}`,
      tone: "flat",
    });
  }
  if (chips.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        {t("repositories.view.evolution.no_metric_changes")}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <Badge
          key={chip.key}
          variant="outline"
          className={cn(
            "font-mono text-[10px] tabular-nums",
            chip.tone === "up" && "border-destructive/30 text-destructive",
            chip.tone === "down" &&
              "border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
          )}
        >
          {chip.text}
        </Badge>
      ))}
    </span>
  );
}

function DeltaValue({ value }: { value: number | string | null }) {
  return (
    <span className="tabular-nums">
      {value == null ? "—" : typeof value === "number" ? value : value}
    </span>
  );
}

/** The deterministic diff between the two selected snapshots. */
function DeltaDetail({ delta }: { delta: AnalysisDeltaOut }) {
  const { t } = useTranslation();
  const deps = delta.dependencies;
  const hasDeps =
    deps.added.length > 0 || deps.removed.length > 0 || deps.changed.length > 0;
  return (
    <div className="space-y-6">
      {delta.facts.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {delta.facts.map((fact) => (
            <div key={fact.field} className="rounded-md border p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {fact.field.replaceAll("_", " ")}
              </p>
              <p className="mt-0.5 text-sm font-semibold">
                <DeltaValue value={fact.before} />
                <span className="mx-1.5 text-muted-foreground">→</span>
                <DeltaValue value={fact.after} />
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("repositories.view.evolution.no_metric_changes")}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {hasDeps ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {t("repositories.view.evolution.dependencies")}
            </p>
            <ul className="space-y-1 text-sm">
              {deps.added.map((dep) => (
                <li key={`a-${dep.ecosystem}-${dep.name}`}>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    +
                  </span>{" "}
                  {dep.name}
                  {dep.after_version ? (
                    <span className="text-muted-foreground">
                      {" "}
                      {dep.after_version}
                    </span>
                  ) : null}
                </li>
              ))}
              {deps.removed.map((dep) => (
                <li key={`r-${dep.ecosystem}-${dep.name}`}>
                  <span className="text-red-600 dark:text-red-400">−</span>{" "}
                  {dep.name}
                </li>
              ))}
              {deps.changed.map((dep) => (
                <li key={`c-${dep.ecosystem}-${dep.name}`}>
                  {dep.name}
                  <span className="text-muted-foreground">
                    {" "}
                    {dep.before_version} → {dep.after_version}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {delta.hotspots_entered.length > 0 || delta.hotspots_left.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {t("repositories.view.evolution.hotspots")}
            </p>
            <ul className="space-y-1 font-mono text-xs">
              {delta.hotspots_entered.map((path) => (
                <li key={`e-${path}`}>
                  <span className="text-destructive">▲</span> {path}
                </li>
              ))}
              {delta.hotspots_left.map((path) => (
                <li key={`l-${path}`}>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    ▼
                  </span>{" "}
                  {path}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {delta.languages.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {t("repositories.view.evolution.languages")}
            </p>
            <ul className="space-y-1 text-sm">
              {delta.languages.map((lang) => (
                <li key={lang.language}>
                  {lang.language}
                  <span className="text-muted-foreground tabular-nums">
                    {" "}
                    {lang.before_loc} → {lang.after_loc} LOC
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {delta.contributors.joined.length > 0 ||
        delta.contributors.departed.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {t("repositories.view.evolution.contributors")}
            </p>
            <ul className="space-y-1 text-sm">
              {delta.contributors.joined.map((name) => (
                <li key={`j-${name}`}>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    +
                  </span>{" "}
                  {name}
                </li>
              ))}
              {delta.contributors.departed.map((name) => (
                <li key={`d-${name}`}>
                  <span className="text-red-600 dark:text-red-400">−</span>{" "}
                  {name}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-sm font-medium">
            {t("repositories.view.evolution.new_commits", {
              count: delta.commits.count,
            })}
          </p>
          {delta.commits.has_commit_data ? (
            <ul className="space-y-1 text-sm">
              {delta.commits.authors.map((author) => (
                <li key={author.email} className="text-muted-foreground">
                  {author.email}
                  <span className="tabular-nums"> · {author.commits}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("repositories.view.evolution.no_commit_data")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Snapshot history, trends, and the "what changed since last check" comparison. */
export function EvolutionPanel({ repoId }: { repoId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: history, isPending } = useAnalysisHistoryQuery(repoId);
  // null = server default (previous -> latest).
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const { data: delta, isPending: deltaPending } = useAnalysisDeltaQuery(
    repoId,
    fromId,
    toId,
  );
  const { mutate: explain, isPending: isQueueing } =
    useExplainDeltaMutation(repoId);

  const { track, isTracking } = useTrackedJob((job) => {
    queryClient.invalidateQueries({
      queryKey: [...repositoryKeys.detail(repoId), "analysis-delta"],
    });
    if (job.status === "succeeded") {
      toast.success(t("repositories.view.evolution.explain_done"));
    } else {
      toast.error(job.error ?? t("repositories.view.evolution.explain_failed"));
    }
  });
  const isExplaining = isQueueing || isTracking;

  const runExplain = () =>
    explain(
      {
        from_id: delta?.from_analysis_id ?? null,
        to_id: delta?.to_analysis_id ?? null,
      },
      {
        onSuccess: (job) => {
          toast.success(t("repositories.view.evolution.explain_queued"));
          track(job.id);
        },
      },
    );

  if (isPending || !history) {
    return <Skeleton className="h-64 w-full" />;
  }

  const newestFirst = [...history].reverse();
  const snapshotItems = history.map((snapshot) => ({
    value: snapshot.analysis_id,
    label: `${formatDate(snapshot.analyzed_at)} · ${shortSha(snapshot.commit_sha)}`,
  }));

  return (
    <div className="space-y-6">
      {history.length < 2 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          {t("repositories.view.evolution.single_snapshot")}
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle>{t("repositories.view.evolution.compare")}</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  [
                    "from",
                    fromId ?? delta?.from_analysis_id ?? null,
                    setFromId,
                  ],
                  ["to", toId ?? delta?.to_analysis_id ?? null, setToId],
                ] as const
              ).map(([slot, value, setValue]) => (
                <Select
                  key={slot}
                  items={snapshotItems}
                  value={value}
                  onValueChange={(next) => next && setValue(next)}
                >
                  <SelectTrigger className="min-w-52 bg-background">
                    <SelectValue
                      placeholder={t(
                        `repositories.view.evolution.slot_${slot}`,
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshotItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ))}
              <Button
                size="sm"
                onClick={runExplain}
                disabled={isExplaining || !delta}
              >
                {isExplaining ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <SparklesIcon />
                )}
                {t("repositories.view.evolution.explain_button")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {deltaPending ? (
              <Skeleton className="h-40 w-full" />
            ) : delta ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {t("repositories.view.evolution.compare_range", {
                    from: shortSha(delta.from_commit_sha),
                    fromDate: formatDate(delta.from_analyzed_at),
                    to: shortSha(delta.to_commit_sha),
                    toDate: formatDate(delta.to_analyzed_at),
                  })}
                </p>
                {delta.note ? (
                  <div className="rounded-md border bg-muted/30 p-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t("repositories.view.evolution.note_title")}
                    </p>
                    <Markdown>{delta.note}</Markdown>
                  </div>
                ) : null}
                <DeltaDetail delta={delta} />
              </>
            ) : null}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <TrendChart
          history={history}
          metric={(s) => s.loc_total}
          label={t("repositories.view.evolution.trend_loc")}
        />
        <TrendChart
          history={history}
          metric={(s) => s.health_score}
          label={t("repositories.view.evolution.trend_health")}
        />
        <TrendChart
          history={history}
          metric={(s) => s.vulnerability_count}
          label={t("repositories.view.evolution.trend_vulns")}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("repositories.view.evolution.timeline")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-0 border-l pl-4">
            {newestFirst.map((snapshot, index) => {
              const previous = newestFirst[index + 1];
              return (
                <div
                  key={snapshot.analysis_id}
                  className="relative py-3 first:pt-0 last:pb-0"
                >
                  <span className="absolute top-1/2 -left-[21.5px] size-2.5 -translate-y-1/2 rounded-full border-2 border-background bg-(--chart-3)" />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {formatDate(snapshot.analyzed_at)}
                    </span>
                    <code className="font-mono text-xs text-muted-foreground">
                      {shortSha(snapshot.commit_sha)}
                    </code>
                    <SnapshotChips snapshot={snapshot} previous={previous} />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
