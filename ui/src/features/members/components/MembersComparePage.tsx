import { getRouteApi, Link } from "@tanstack/react-router";
import { ChevronLeftIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Sparkline } from "@/components/shared/Sparkline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { MemberActivityOut, MemberSummaryOut } from "@/lib/api";
import { useMemberActivityQuery, useMembersOverviewQuery } from "../api";

const route = getRouteApi("/members/compare");
const SLOTS = [0, 1, 2] as const;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** One comparison row with a shared label; children rendered per column. */
function Row({
  label,
  columns,
}: {
  label: string;
  columns: React.ReactNode[];
}) {
  return (
    <>
      <div className="col-span-full border-t pt-3 text-xs font-medium text-muted-foreground first:border-t-0">
        {label}
      </div>
      {columns.map((content, index) => (
        <div key={SLOTS[index]} className="min-w-0 pb-3">
          {content}
        </div>
      ))}
    </>
  );
}

/** Side-by-side comparison of two or three members (resilience lens, not a ranking). */
export function MembersComparePage() {
  const { t } = useTranslation();
  const { ids, anonymize } = route.useSearch();
  const navigate = route.useNavigate();
  const { data, isPending } = useMembersOverviewQuery(anonymize);

  // Fixed slot count keeps the hook order stable; empty ids stay disabled.
  const activity0 = useMemberActivityQuery((ids ?? [])[0] ?? "", anonymize);
  const activity1 = useMemberActivityQuery((ids ?? [])[1] ?? "", anonymize);
  const activity2 = useMemberActivityQuery((ids ?? [])[2] ?? "", anonymize);
  const activities = [activity0.data, activity1.data, activity2.data];

  if (isPending) return <Skeleton className="h-[70vh] w-full" />;

  const members = data?.members ?? [];
  const selected = (ids ?? [])
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is MemberSummaryOut => Boolean(m));
  const activityOf = (id: string): MemberActivityOut | undefined =>
    activities.find((a) => a?.id === id);

  const setSlot = (slot: number, id: string | null) => {
    const next: (string | undefined)[] = [...(ids ?? [])];
    next[slot] = id ?? undefined;
    navigate({
      search: {
        ids: next.filter((x): x is string => Boolean(x)),
        anonymize,
      },
      replace: true,
    });
  };

  const items = [
    { value: null, label: t("members.compare.slot_empty") },
    ...members.map((m) => ({ value: m.id, label: m.name })),
  ];
  const cols = selected.length || 1;
  const gridCols =
    cols >= 3 ? "lg:grid-cols-3" : cols === 2 ? "lg:grid-cols-2" : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          render={<Link to="/members" search={{ anonymize }} />}
        >
          <ChevronLeftIcon />
          {t("members.compare.back")}
        </Button>
        <h1 className="font-heading text-xl font-semibold">
          {t("members.compare.title")}
        </h1>
      </div>

      <div className="flex flex-wrap gap-2">
        {SLOTS.map((slot) => (
          <Select
            key={slot}
            items={items}
            value={(ids ?? [])[slot] ?? null}
            onValueChange={(value) => setSlot(slot, value)}
          >
            <SelectTrigger className="min-w-56 bg-background">
              <SelectValue
                placeholder={t("members.compare.slot_placeholder", {
                  n: slot + 1,
                })}
              />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.label} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>

      {selected.length < 2 ? (
        <div className="grid min-h-[40vh] place-items-center rounded-xl border">
          <p className="text-sm text-muted-foreground">
            {t("members.compare.pick_two")}
          </p>
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 gap-x-6 gap-y-1 rounded-xl border bg-card p-4 ${gridCols}`}
        >
          <Row
            label={t("members.compare.row_member")}
            columns={selected.map((m) => (
              <div key={m.id} className="flex flex-col gap-0.5">
                <Link
                  to="/members/$id"
                  params={{ id: m.id }}
                  search={{ anonymize }}
                  className="font-medium text-primary hover:underline"
                >
                  {m.name}
                </Link>
                <span className="truncate text-xs text-muted-foreground">
                  {m.email}
                </span>
              </div>
            ))}
          />
          <Row
            label={t("members.compare.row_activity")}
            columns={selected.map((m) => (
              <Sparkline key={m.id} values={m.weekly_commits} />
            ))}
          />
          <Row
            label={t("members.compare.row_commits")}
            columns={selected.map((m) => (
              <span key={m.id} className="tabular-nums">
                {m.commits}
              </span>
            ))}
          />
          <Row
            label={t("members.compare.row_churn")}
            columns={selected.map((m) => (
              <span key={m.id} className="font-mono text-xs tabular-nums">
                <span className="text-emerald-600 dark:text-emerald-400">
                  +{m.lines_added}
                </span>{" "}
                <span className="text-red-600 dark:text-red-400">
                  −{m.lines_removed}
                </span>
              </span>
            ))}
          />
          <Row
            label={t("members.compare.row_files")}
            columns={selected.map((m) => (
              <span key={m.id} className="tabular-nums">
                {m.files_touched}
              </span>
            ))}
          />
          <Row
            label={t("members.compare.row_repositories")}
            columns={selected.map((m) => (
              <span key={m.id} className="tabular-nums">
                {m.repository_count}
              </span>
            ))}
          />
          <Row
            label={t("members.compare.row_active_span")}
            columns={selected.map((m) => (
              <span key={m.id} className="text-sm text-muted-foreground">
                {formatDate(m.first_active_at)} → {formatDate(m.last_active_at)}
              </span>
            ))}
          />
          <Row
            label={t("members.compare.row_status")}
            columns={selected.map((m) => (
              <Badge key={m.id} variant="outline">
                {t(`members.list.status_${m.status}`)}
              </Badge>
            ))}
          />
          <Row
            label={t("members.compare.row_median_size")}
            columns={selected.map((m) => {
              const activity = activityOf(m.id);
              return activity ? (
                <span key={m.id} className="tabular-nums">
                  {activity.sizes.median_lines}
                </span>
              ) : (
                <Skeleton key={m.id} className="h-5 w-12" />
              );
            })}
          />
          <Row
            label={t("members.compare.row_large_share")}
            columns={selected.map((m) => {
              const activity = activityOf(m.id);
              return activity ? (
                <span key={m.id} className="tabular-nums">
                  {Math.round(activity.sizes.large_share * 100)}%
                </span>
              ) : (
                <Skeleton key={m.id} className="h-5 w-12" />
              );
            })}
          />
          <Row
            label={t("members.compare.row_top_repos")}
            columns={selected.map((m) => {
              const activity = activityOf(m.id);
              if (!activity)
                return <Skeleton key={m.id} className="h-16 w-full" />;
              return (
                <div key={m.id} className="space-y-2">
                  {activity.repositories.slice(0, 3).map((repo) => {
                    const pct = Math.round(repo.share * 1000) / 10;
                    return (
                      <div key={repo.repository_id} className="space-y-0.5">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex min-w-0 items-center gap-1 truncate">
                            {repo.repository_name}
                            {repo.sole_maintainer ? (
                              <TriangleAlertIcon className="size-3 shrink-0 text-warning" />
                            ) : null}
                          </span>
                          <span className="shrink-0 text-muted-foreground tabular-nums">
                            {pct}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
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
            })}
          />
        </div>
      )}
    </div>
  );
}
