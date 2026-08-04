import { CheckIcon, CopyIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
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

export type PulseRange = "today" | "3d" | "week" | "month";

const RANGE_DAYS: Record<PulseRange, number> = {
  today: 0,
  "3d": 3,
  week: 7,
  month: 30,
};

/** Window start: local midnight, `days` back. Stable string per (range, calendar day). */
export function sinceFor(range: PulseRange): string {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - RANGE_DAYS[range],
  ).toISOString();
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
  onReposChange,
  onRangeChange,
}: {
  repos: string[];
  range: PulseRange;
  onReposChange: (repos: string[]) => void;
  onRangeChange: (range: PulseRange) => void;
}) {
  const { t } = useTranslation();
  const since = sinceFor(range);
  const { data, isPending } = usePulseQuery(since, repos);
  const { mutate: summarize, isPending: isQueueing } =
    useSummarizePulseMutation();

  const entries = data?.entries ?? [];
  const active = entries.filter((e) => (e.activity?.commits ?? 0) > 0);
  const idle = entries.filter((e) => (e.activity?.commits ?? 0) === 0);
  const summarizable = active.filter((e) => !e.summary && !e.summary_pending);

  const copyMarkdown = () => {
    const lines: string[] = [
      `## Pulse — ${t(`developments.pulse.range_${range}`)} (${formatDate(since)})`,
      "",
    ];
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <RepoPicker
          selected={repos}
          onChange={onReposChange}
          allCount={entries.length}
        />
        <Select
          value={range}
          onValueChange={(v) => onRangeChange((v ?? "today") as PulseRange)}
        >
          <SelectTrigger className="w-44">
            <SelectValue>
              {(value) => t(`developments.pulse.range_${value}`)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(RANGE_DAYS) as PulseRange[]).map((r) => (
              <SelectItem key={r} value={r}>
                {t(`developments.pulse.range_${r}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={isQueueing || summarizable.length === 0}
            onClick={() =>
              summarize(
                { since, repository_ids: repos.length > 0 ? repos : null },
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
          {active.length >= 2 ? <PulseRadar entries={active} /> : null}
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

/** Multi-axis comparison: one polygon per repo, each activity metric normalized to its
 * across-repo maximum — shows the character of activity, not just volume. */
function PulseRadar({ entries }: { entries: PulseEntryOut[] }) {
  const { t } = useTranslation();

  const metrics = [
    { key: "commits", get: (e: PulseEntryOut) => e.activity?.commits ?? 0 },
    {
      key: "insertions",
      get: (e: PulseEntryOut) => e.activity?.insertions ?? 0,
    },
    { key: "deletions", get: (e: PulseEntryOut) => e.activity?.deletions ?? 0 },
    {
      key: "members",
      get: (e: PulseEntryOut) => e.activity?.authors.length ?? 0,
    },
    {
      key: "files",
      get: (e: PulseEntryOut) => e.activity?.files_changed ?? 0,
    },
  ] as const;

  const data = metrics.map((m) => {
    const max = Math.max(...entries.map(m.get), 1);
    const row: Record<string, string | number> = {
      metric: t(`developments.pulse.axis_${m.key}`),
    };
    for (const e of entries) row[e.repository.slug] = (m.get(e) / max) * 100;
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
              {entries.map((e, i) => (
                <Radar
                  key={e.repository.id}
                  name={e.repository.slug}
                  dataKey={e.repository.slug}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                  fillOpacity={0.12}
                />
              ))}
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
          {entries.map((e, i) => (
            <span
              key={e.repository.id}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <span
                className="size-2.5 rounded-full"
                style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
              />
              {e.repository.slug}
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
