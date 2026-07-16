import { useNavigate } from "@tanstack/react-router";
import {
  CircleCheckIcon,
  GitPullRequestIcon,
  type LucideIcon,
  RadarIcon,
  ScaleIcon,
  SirenIcon,
  XCircleIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Card } from "@/components/ui/card";
import type { HomeStatusOut } from "@/lib/api";

type AttentionRow = {
  key: string;
  count: number;
  icon: LucideIcon;
  go: () => void;
};

/**
 * The inbox strip: everything currently waiting on the user, each row deep-
 * linking to where it gets handled. Rows with a zero count disappear; when
 * everything is clear the card collapses to a one-liner.
 */
export function AttentionCard({ status }: { status: HomeStatusOut }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { attention } = status;

  const rows: AttentionRow[] = [
    {
      key: "drift",
      count: attention.drift_findings,
      icon: RadarIcon,
      go: () => navigate({ to: "/roadmaps", search: { page: 1, size: 20 } }),
    },
    {
      key: "prs",
      count: attention.open_prs,
      icon: GitPullRequestIcon,
      go: () => navigate({ to: "/roadmaps", search: { page: 1, size: 20 } }),
    },
    {
      key: "failed_jobs",
      count: attention.failed_jobs_24h,
      icon: XCircleIcon,
      go: () =>
        navigate({
          to: "/jobs",
          search: { tab: "runs", status: "failed", page: 1, size: 20 },
        }),
    },
    {
      key: "principles",
      count: attention.violated_principles,
      icon: ScaleIcon,
      go: () => navigate({ to: "/principles" }),
    },
    {
      key: "briefing",
      count: attention.briefing_now_unread,
      icon: SirenIcon,
      go: () => navigate({ to: "/hobits", search: { tab: "feed" } }),
    },
  ].filter((row) => row.count > 0);

  if (rows.length === 0) {
    return (
      <Card className="flex-row items-center gap-2 p-4">
        <CircleCheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
        <p className="text-sm text-muted-foreground">
          {t("home.attention.all_clear")}
        </p>
      </Card>
    );
  }

  return (
    <Card className="gap-2 p-5">
      <h2 className="text-sm font-semibold">{t("home.attention.title")}</h2>
      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <li key={row.key}>
              <button
                type="button"
                onClick={row.go}
                className="flex w-full items-center gap-3 py-2.5 text-left text-sm hover:bg-muted/40"
              >
                <Icon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="min-w-0 flex-1">
                  {t(`home.attention.rows.${row.key}`, { count: row.count })}
                </span>
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {row.count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
