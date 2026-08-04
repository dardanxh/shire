import { CheckIcon, CopyIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRepositoriesQuery } from "@/features/repositories/api";
import type { PulseEntryOut } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { usePulseQuery, useSummarizePulseMutation } from "../api";

export type PulseRange = "today" | "3d" | "week" | "month" | "custom";

const RANGE_DAYS: Record<Exclude<PulseRange, "custom">, number> = {
  today: 0,
  "3d": 3,
  week: 7,
  month: 30,
};

/** Local midnight of a `YYYY-MM-DD` day. */
function localMidnight(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** A Date's local `YYYY-MM-DD` day. */
function localDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The query window for a range selection. Preset ranges are open-ended (no `until`,
 * meaning "until now"); a custom interval is bounded by exclusive midnight after `to`.
 * `days` is the window length, used to derive the previous window for comparison.
 * Stable strings per (selection, calendar day). */
export function windowFor(
  range: PulseRange,
  from?: string,
  to?: string,
): { since: string; until?: string; days: number } {
  if (range === "custom" && from && to) {
    const [a, b] = from <= to ? [from, to] : [to, from];
    const start = localMidnight(a);
    const endExclusive = localMidnight(b);
    endExclusive.setDate(endExclusive.getDate() + 1);
    const days = Math.max(
      Math.round((endExclusive.getTime() - start.getTime()) / 86_400_000),
      1,
    );
    return {
      since: start.toISOString(),
      until: endExclusive.toISOString(),
      days,
    };
  }
  const back = range === "custom" ? 0 : RANGE_DAYS[range];
  const now = new Date();
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - back,
  );
  return { since: start.toISOString(), days: back + 1 };
}

/** The window of equal length immediately before `since`. */
function previousWindow(
  since: string,
  days: number,
): {
  since: string;
  until: string;
} {
  const start = new Date(since);
  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - days);
  return { since: prevStart.toISOString(), until: start.toISOString() };
}

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function PulseTab({
  repos,
  range,
  from,
  to,
  onReposChange,
  onRangeChange,
  onCustomDatesChange,
}: {
  repos: string[];
  range: PulseRange;
  from?: string;
  to?: string;
  onReposChange: (repos: string[]) => void;
  onRangeChange: (range: PulseRange) => void;
  onCustomDatesChange: (from: string, to: string) => void;
}) {
  const { t } = useTranslation();
  const { since, until, days } = windowFor(range, from, to);
  const { data, isPending } = usePulseQuery(since, until, repos);
  const { mutate: summarize, isPending: isQueueing } =
    useSummarizePulseMutation();

  const entries = data?.entries ?? [];
  const active = entries.filter((e) => (e.activity?.commits ?? 0) > 0);
  const idle = entries.filter((e) => (e.activity?.commits ?? 0) === 0);
  const summarizable = active.filter((e) => !e.summary && !e.summary_pending);

  const copyMarkdown = () => {
    const heading =
      range === "custom" && from && to
        ? `${from} → ${to}`
        : `${t(`developments.pulse.range_${range}`)} (${formatDate(since)})`;
    const lines: string[] = [`## Pulse — ${heading}`, ""];
    for (const e of active) {
      const a = e.activity;
      if (!a) continue;
      lines.push(`### ${e.repository.slug}`);
      lines.push(
        `${a.commits} commits, +${a.insertions}/−${a.deletions} lines — ` +
          a.authors.map((x) => `${x.email} (${x.commits})`).join(", "),
      );
      if (e.summary) lines.push("", e.summary.trim());
      lines.push("");
    }
    if (idle.length > 0) {
      lines.push(
        `_No activity: ${idle.map((e) => e.repository.slug).join(", ")}_`,
      );
    }
    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => toast.success(t("developments.pulse.copied")));
  };

  const selectRange = (value: string | null) => {
    const next = (value ?? "today") as PulseRange;
    if (next === "custom") {
      // Seed a sensible interval so the pickers never open on an empty window.
      const today = new Date();
      const weekAgo = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - 6,
      );
      onCustomDatesChange(from ?? localDay(weekAgo), to ?? localDay(today));
    } else {
      onRangeChange(next);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <RepoPicker
          selected={repos}
          onChange={onReposChange}
          allCount={entries.length}
        />
        <Select value={range} onValueChange={selectRange}>
          <SelectTrigger className="w-44">
            <SelectValue>
              {(value) => t(`developments.pulse.range_${value}`)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {([...Object.keys(RANGE_DAYS), "custom"] as PulseRange[]).map(
              (r) => (
                <SelectItem key={r} value={r}>
                  {t(`developments.pulse.range_${r}`)}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        {range === "custom" ? (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              className="w-36"
              aria-label={t("developments.pulse.from")}
              value={from ?? ""}
              max={to}
              onChange={(e) => {
                if (e.target.value)
                  onCustomDatesChange(e.target.value, to ?? e.target.value);
              }}
            />
            <span className="text-sm text-muted-foreground">–</span>
            <Input
              type="date"
              className="w-36"
              aria-label={t("developments.pulse.to")}
              value={to ?? ""}
              min={from}
              onChange={(e) => {
                if (e.target.value)
                  onCustomDatesChange(from ?? e.target.value, e.target.value);
              }}
            />
          </div>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={isQueueing || summarizable.length === 0}
            onClick={() =>
              summarize(
                {
                  since,
                  until: until ?? null,
                  repository_ids: repos.length > 0 ? repos : null,
                },
                {
                  onSuccess: (queued) =>
                    toast.success(
                      t("developments.pulse.summarize_toast", {
                        count: queued.length,
                      }),
                    ),
                },
              )
            }
          >
            <SparklesIcon className="size-3.5" />
            {t("developments.pulse.summarize")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={active.length === 0}
            onClick={copyMarkdown}
          >
            <CopyIcon className="size-3.5" />
            {t("developments.pulse.copy")}
          </Button>
        </div>
      </div>

      {isPending ? null : active.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t("developments.pulse.all_quiet")}
          </CardContent>
        </Card>
      ) : (
        <>
          {active.length === 1 ? (
            <SingleRepoCharts
              entry={active[0]}
              since={since}
              until={until}
              days={days}
            />
          ) : (
            <PulseRadar
              series={active.map((e) => ({
                key: e.repository.id,
                name: e.repository.slug,
                activity: e.activity,
              }))}
            />
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {active.map((entry) => (
              <PulseCard key={entry.repository.id} entry={entry} />
            ))}
          </div>
        </>
      )}

      {idle.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("developments.pulse.idle", { count: idle.length })}{" "}
          {idle.map((e) => e.repository.slug).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

/** Multi-select of repositories to compare; empty selection = all repositories. */
function RepoPicker({
  selected,
  onChange,
  allCount,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  allCount: number;
}) {
  const { t } = useTranslation();
  const { data } = useRepositoriesQuery({ page: 1, page_size: 100 });
  const options = data?.items ?? [];

  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" />}>
        {selected.length === 0
          ? t("developments.pulse.all_repos", { count: allCount })
          : t("developments.pulse.n_repos", { count: selected.length })}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder={t("developments.add_search")} />
          <CommandList>
            <CommandEmpty>{t("developments.add_no_match")}</CommandEmpty>
            <CommandGroup>
              {options.map((repo) => (
                <CommandItem
                  key={repo.id}
                  value={repo.slug}
                  onSelect={() => toggle(repo.id)}
                >
                  <Checkbox
                    checked={selected.includes(repo.id)}
                    className="pointer-events-none"
                  />
                  {repo.slug}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {selected.length > 0 ? (
          <div className="border-t p-2">
            <Button
              size="sm"
              variant="ghost"
              className="w-full"
              onClick={() => onChange([])}
            >
              {t("developments.pulse.clear_selection")}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** One repo in the comparison: a daily-commits chart plus the spider chart, where the
 * second polygon is the same repo's previous window of equal length — the axes need a
 * second series to compare against, and "before" is the only meaningful one. */
function SingleRepoCharts({
  entry,
  since,
  until,
  days,
}: {
  entry: PulseEntryOut;
  since: string;
  until?: string;
  days: number;
}) {
  const { t } = useTranslation();
  const prev = previousWindow(since, days);
  const { data: prevData, isPending } = usePulseQuery(prev.since, prev.until, [
    entry.repository.id,
  ]);
  const prevActivity =
    prevData?.entries.find((e) => e.repository.id === entry.repository.id)
      ?.activity ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <DailyActivityCard entry={entry} since={since} until={until} />
      {isPending ? null : (
        <PulseRadar
          series={[
            {
              key: "current",
              name: t("developments.pulse.this_window"),
              activity: entry.activity,
            },
            {
              key: "previous",
              name: t("developments.pulse.previous_window"),
              activity: prevActivity,
            },
          ]}
        />
      )}
    </div>
  );
}

// Beyond this many days, zero-filling every day would drown the chart — plot only
// the days that actually had commits.
const ZERO_FILL_LIMIT = 120;

/** Commits per day across the window, zero-filled so quiet days stay visible. */
function DailyActivityCard({
  entry,
  since,
  until,
}: {
  entry: PulseEntryOut;
  since: string;
  until?: string;
}) {
  const { t } = useTranslation();
  const daily = entry.activity?.daily ?? [];
  const counts = new Map(daily.map((d) => [d.day, d.commits]));

  const start = new Date(since);
  const endExclusive = until ? new Date(until) : new Date();
  const data: { day: string; commits: number }[] = [];
  const cursor = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  while (cursor < endExclusive && data.length <= ZERO_FILL_LIMIT) {
    const key = localDay(cursor);
    data.push({ day: key, commits: counts.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  const points =
    data.length > ZERO_FILL_LIMIT
      ? [...daily].sort((a, b) => a.day.localeCompare(b.day))
      : data;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {t("developments.pulse.daily_commits")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={points}
              margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="var(--border)"
              />
              <XAxis
                dataKey="day"
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
                cursor={{ fill: "var(--muted)" }}
                formatter={(value) => [
                  value as number,
                  t("developments.pulse.axis_commits"),
                ]}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  fontSize: 12,
                  color: "var(--popover-foreground)",
                }}
              />
              <Bar
                dataKey="commits"
                fill="var(--chart-2)"
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

type RadarSeries = {
  key: string;
  name: string;
  activity: PulseEntryOut["activity"];
};

/** Multi-axis comparison: one polygon per series, each activity metric normalized to its
 * across-series maximum — shows the character of activity, not just volume. */
function PulseRadar({ series }: { series: RadarSeries[] }) {
  const { t } = useTranslation();

  const metrics = [
    { key: "commits", get: (a: RadarSeries["activity"]) => a?.commits ?? 0 },
    {
      key: "insertions",
      get: (a: RadarSeries["activity"]) => a?.insertions ?? 0,
    },
    {
      key: "deletions",
      get: (a: RadarSeries["activity"]) => a?.deletions ?? 0,
    },
    {
      key: "members",
      get: (a: RadarSeries["activity"]) => a?.authors.length ?? 0,
    },
    {
      key: "files",
      get: (a: RadarSeries["activity"]) => a?.files_changed ?? 0,
    },
  ] as const;

  const data = metrics.map((m) => {
    const max = Math.max(...series.map((s) => m.get(s.activity)), 1);
    const row: Record<string, string | number> = {
      metric: t(`developments.pulse.axis_${m.key}`),
    };
    for (const s of series) row[s.key] = (m.get(s.activity) / max) * 100;
    return row;
  });

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} outerRadius="75%">
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis
                dataKey="metric"
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              />
              {series.map((s, i) => (
                <Radar
                  key={s.key}
                  name={s.name}
                  dataKey={s.key}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                  fillOpacity={0.12}
                />
              ))}
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
          {series.map((s, i) => (
            <span
              key={s.key}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <span
                className="size-2.5 rounded-full"
                style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
              />
              {s.name}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PulseCard({ entry }: { entry: PulseEntryOut }) {
  const { t } = useTranslation();
  const a = entry.activity;
  if (!a) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{entry.repository.slug}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-medium">
            {t("developments.pulse.commits", { count: a.commits })}
          </span>
          <span className="font-mono text-xs">
            <span className="text-green-600 dark:text-green-500">
              +{a.insertions}
            </span>{" "}
            <span className="text-red-600 dark:text-red-500">
              −{a.deletions}
            </span>
          </span>
          <span className="text-xs text-muted-foreground">
            {t("developments.pulse.files", { count: a.files_changed })}
          </span>
        </div>

        <DailySparkline daily={a.daily} />

        <div className="flex flex-wrap gap-1.5">
          {a.authors.map((author) => (
            <Badge
              key={author.email}
              variant="secondary"
              className="font-normal"
            >
              {author.email}
              <span className="ml-1 text-muted-foreground">
                ×{author.commits}
              </span>
            </Badge>
          ))}
        </div>

        {entry.summary ? (
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <Markdown>{entry.summary}</Markdown>
          </div>
        ) : entry.summary_pending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-3.5 animate-spin" />
            {t("developments.summary_auto_pending")}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckIcon className="size-3" />
            {t("developments.pulse.no_summary_yet")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Commits per day across the window — tiny inline bars, no chart lib needed. */
function DailySparkline({
  daily,
}: {
  daily: { day: string; commits: number }[];
}) {
  if (daily.length <= 1) return null;
  const max = Math.max(...daily.map((d) => d.commits), 1);
  return (
    <div
      className="flex h-8 items-end gap-0.5"
      title={daily.map((d) => `${d.day}: ${d.commits}`).join("\n")}
    >
      {daily.map((d) => (
        <div
          key={d.day}
          className="w-2 rounded-sm bg-(--chart-2)"
          style={{ height: `${Math.max((d.commits / max) * 100, 8)}%` }}
        />
      ))}
    </div>
  );
}
