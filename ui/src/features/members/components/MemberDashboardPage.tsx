import { getRouteApi, Link } from "@tanstack/react-router";
import {
  ChevronLeftIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { MemberActivityOut, MemberDetailOut } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useMemberActivityQuery, useMemberDetailQuery } from "../api";

const route = getRouteApi("/members/$id");

// 2024-01-01 is a Monday — used purely to render localized weekday labels.
const WEEKDAY_LABEL = (weekday: number) =>
  new Date(Date.UTC(2024, 0, 1 + weekday)).toLocaleDateString("en-US", {
    weekday: "short",
  });

const CHART_TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  fontSize: 12,
  color: "var(--popover-foreground)",
} as const;

function formatWeek(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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
    <Card className="gap-1 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-3 p-4", className)}>
      <p className="text-sm font-medium">{title}</p>
      {children}
    </Card>
  );
}

/** Weekly commits as an area chart (all-time, one point per active week). */
function TimelineChart({ activity }: { activity: MemberActivityOut }) {
  const { t } = useTranslation();
  if (activity.weekly.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {t("members.dashboard.timeline_empty")}
      </p>
    );
  }
  const data = activity.weekly.map((w) => ({
    label: w.week_start,
    commits: w.commits,
  }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
        >
          <defs>
            <linearGradient id="memberCommitsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.5} />
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
            tickFormatter={formatWeek}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
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
            labelFormatter={(label) => formatDate(String(label))}
            formatter={(value) => [
              value as number,
              t("members.dashboard.timeline_tooltip"),
            ]}
            contentStyle={CHART_TOOLTIP_STYLE}
          />
          <Area
            type="monotone"
            dataKey="commits"
            stroke="var(--chart-3)"
            strokeWidth={2}
            fill="url(#memberCommitsFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Commit-size histogram — steady small changes vs batch-y large drops. */
function SizesChart({ activity }: { activity: MemberActivityOut }) {
  const { t } = useTranslation();
  const data = activity.sizes.buckets.map((b) => ({
    label: b.label,
    count: b.count,
  }));
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
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
            interval={0}
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
              t("members.dashboard.sizes_tooltip"),
            ]}
            contentStyle={CHART_TOOLTIP_STYLE}
          />
          <Bar dataKey="count" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Weekday × hour commit grid on the author's local clock. */
function WorkPatternHeatmap({ activity }: { activity: MemberActivityOut }) {
  const { t } = useTranslation();
  if (activity.heatmap.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {t("members.dashboard.heatmap_empty")}
      </p>
    );
  }
  const byCell = new Map(
    activity.heatmap.map((c) => [`${c.weekday}-${c.hour}`, c.commits]),
  );
  const max = Math.max(...activity.heatmap.map((c) => c.commits), 1);
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const weekdays = [0, 1, 2, 3, 4, 5, 6];
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        {weekdays.map((weekday) => (
          <div key={weekday} className="flex items-center gap-1 py-0.5">
            <span className="w-9 shrink-0 text-[10px] text-muted-foreground">
              {WEEKDAY_LABEL(weekday)}
            </span>
            {hours.map((hour) => {
              const commits = byCell.get(`${weekday}-${hour}`) ?? 0;
              return (
                <div
                  key={hour}
                  title={`${WEEKDAY_LABEL(weekday)} ${hour}:00 — ${commits}`}
                  className="h-4 flex-1 rounded-[3px] bg-(--chart-3)"
                  style={{
                    opacity:
                      commits === 0 ? 0.06 : 0.15 + 0.85 * (commits / max),
                  }}
                />
              );
            })}
          </div>
        ))}
        <div className="mt-1 flex items-center gap-1 pl-10 text-[10px] text-muted-foreground">
          {hours.map((hour) => (
            <span key={hour} className="flex-1 text-center">
              {hour % 6 === 0 ? hour : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Per-repo commit share — how much the member gravitates to each repo. */
function RepoShares({
  activity,
  detail,
}: {
  activity: MemberActivityOut;
  detail: MemberDetailOut;
}) {
  const { t } = useTranslation();
  const churnByRepo = new Map(
    detail.repositories.map((r) => [r.repository_id, r]),
  );
  return (
    <div className="space-y-3">
      {activity.repositories.map((repo) => {
        const churn = churnByRepo.get(repo.repository_id);
        const pct = Math.round(repo.share * 1000) / 10;
        return (
          <div key={repo.repository_id} className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                {repo.repository_name}
                {repo.sole_maintainer ? (
                  <Badge
                    variant="outline"
                    className="gap-1 border-warning/30 bg-warning/10 text-warning"
                  >
                    <TriangleAlertIcon className="size-3" />
                    {t("members.dashboard.sole_maintainer")}
                  </Badge>
                ) : null}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {t("members.dashboard.share_detail", {
                  member: repo.member_commits,
                  total: repo.total_commits,
                  pct,
                })}
                {churn ? (
                  <span className="ml-2 font-mono">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      +{churn.lines_added}
                    </span>{" "}
                    <span className="text-red-600 dark:text-red-400">
                      −{churn.lines_removed}
                    </span>
                  </span>
                ) : null}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-(--chart-3)"
                style={{ width: `${Math.max(pct, 1)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MemberDashboardPage() {
  const { t } = useTranslation();
  const { id } = route.useParams();
  const { anonymize } = route.useSearch();
  const { data: detail, isPending: detailPending } = useMemberDetailQuery(
    id,
    anonymize,
  );
  const { data: activity, isPending: activityPending } = useMemberActivityQuery(
    id,
    anonymize,
  );

  if (detailPending || activityPending || !detail || !activity) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const largePct = Math.round(activity.sizes.large_share * 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          render={<Link to="/members" search={{ anonymize, tab: "members" }} />}
        >
          <ChevronLeftIcon />
          {t("members.dashboard.back")}
        </Button>
        <div className="min-w-0">
          <h1 className="font-heading text-xl font-semibold">{detail.name}</h1>
          <p className="text-sm text-muted-foreground">{detail.email}</p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "ml-auto",
            detail.status === "active"
              ? "border-emerald-500/25 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : "border-foreground/10 bg-muted text-muted-foreground",
          )}
        >
          {t(`members.list.status_${detail.status}`)}
        </Badge>
      </div>

      {activity.missing_data_repositories > 0 ? (
        <Card className="flex-row items-start gap-3 border-warning/30 bg-warning/5 p-4">
          <RefreshCwIcon className="mt-0.5 size-4 shrink-0 text-warning" />
          <p className="text-sm text-muted-foreground">
            {t("members.dashboard.missing_data", {
              count: activity.missing_data_repositories,
            })}{" "}
            <Link
              to="/repositories"
              search={{ view: "repositories", page: 1, size: 20 }}
              className="font-medium text-primary hover:underline"
            >
              {t("members.dashboard.missing_data_link")}
            </Link>
          </p>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label={t("members.detail.commits")}
          value={String(detail.commits)}
        />
        <Stat
          label={t("members.detail.lines_added")}
          value={`+${detail.lines_added}`}
        />
        <Stat
          label={t("members.detail.lines_removed")}
          value={`−${detail.lines_removed}`}
        />
        <Stat
          label={t("members.detail.files")}
          value={String(detail.files_touched)}
        />
        <Stat
          label={t("members.dashboard.repositories")}
          value={String(detail.repositories.length)}
        />
        <Stat
          label={t("members.dashboard.active_span")}
          value={formatDate(detail.first_active_at)}
          hint={t("members.dashboard.active_span_hint", {
            last: formatDate(detail.last_active_at),
          })}
        />
      </div>

      <Section title={t("members.dashboard.timeline_title")}>
        <TimelineChart activity={activity} />
      </Section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title={t("members.dashboard.sizes_title")}>
          <div className="grid grid-cols-3 gap-3">
            <Stat
              label={t("members.dashboard.median_size")}
              value={String(activity.sizes.median_lines)}
            />
            <Stat
              label={t("members.dashboard.p90_size")}
              value={String(activity.sizes.p90_lines)}
            />
            <Stat
              label={t("members.dashboard.large_share")}
              value={`${largePct}%`}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("members.dashboard.large_share_hint", { pct: largePct })}
          </p>
          <SizesChart activity={activity} />
        </Section>
        <Section title={t("members.dashboard.heatmap_title")}>
          <p className="text-xs text-muted-foreground">
            {t("members.dashboard.heatmap_hint")}
          </p>
          <WorkPatternHeatmap activity={activity} />
        </Section>
      </div>

      <Section title={t("members.dashboard.shares_title")}>
        <p className="text-xs text-muted-foreground">
          {t("members.dashboard.shares_hint")}
        </p>
        <RepoShares activity={activity} detail={detail} />
      </Section>
    </div>
  );
}
