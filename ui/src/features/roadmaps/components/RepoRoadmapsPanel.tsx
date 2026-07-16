import { Link } from "@tanstack/react-router";
import { MapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { JobStatusBadge } from "@/features/jobs";
import type { RepoRoadmapSliceOut } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useRepoRoadmapsQuery } from "../api";
import { EffortBadge, ItemStatusBadge, LabelBadge } from "./chips";

/**
 * The repository detail's Roadmaps tab: every roadmap that covers this repo,
 * sliced to this repo's items of the current version. Rows link into the full
 * roadmap with the item dialog pre-opened.
 */
export function RepoRoadmapsPanel({ repositoryId }: { repositoryId: string }) {
  const { t } = useTranslation();
  const { data: slices, isPending } = useRepoRoadmapsQuery(repositoryId);

  if (isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (!slices || slices.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <MapIcon className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {t("roadmaps.repo_tab.empty")}
        </p>
        <Link
          to="/roadmaps/new"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          {t("roadmaps.repo_tab.empty_cta")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {slices.map((slice) => (
        <RoadmapSliceCard key={slice.roadmap_id} slice={slice} />
      ))}
    </div>
  );
}

function RoadmapSliceCard({ slice }: { slice: RepoRoadmapSliceOut }) {
  const { t } = useTranslation();
  const pct =
    slice.items_total > 0
      ? Math.round((slice.items_done / slice.items_total) * 100)
      : 0;

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              to="/roadmaps/$id"
              params={{ id: slice.roadmap_id }}
              search={{ tab: "board" }}
              className="truncate text-sm font-semibold hover:underline"
            >
              {slice.name}
            </Link>
            {slice.generation_status === "pending" ? (
              <JobStatusBadge status="running" />
            ) : slice.version_number ? (
              <span className="text-xs text-muted-foreground">
                v{slice.version_number}
              </span>
            ) : null}
          </div>
          {slice.goal ? (
            <p className="max-w-xl truncate text-xs text-muted-foreground">
              {slice.goal}
            </p>
          ) : null}
        </div>
        {slice.items_total > 0 ? (
          <div className="flex shrink-0 items-center gap-2">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {t("roadmaps.repo_tab.progress", {
                done: slice.items_done,
                total: slice.items_total,
              })}
            </span>
          </div>
        ) : null}
      </div>

      {slice.items.length > 0 ? (
        <div className="divide-y divide-border rounded-lg border border-border">
          {slice.items.map((item) => (
            <Link
              key={item.id}
              to="/roadmaps/$id"
              params={{ id: slice.roadmap_id }}
              search={{ tab: "items", item: item.id }}
              className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50"
            >
              <span
                className={cn(
                  "min-w-0 flex-1 truncate font-medium",
                  item.status === "done" &&
                    "text-muted-foreground line-through",
                )}
              >
                {item.title}
              </span>
              <LabelBadge label={item.label} />
              <EffortBadge effort={item.effort} />
              <ItemStatusBadge status={item.status} />
            </Link>
          ))}
        </div>
      ) : slice.generation_status !== "pending" ? (
        <p className="text-xs text-muted-foreground">
          {t("roadmaps.repo_tab.no_items")}
        </p>
      ) : null}
    </Card>
  );
}
