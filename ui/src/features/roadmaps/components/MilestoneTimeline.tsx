import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Card } from "@/components/ui/card";
import type { RoadmapDetailOut, RoadmapItemOut } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ItemCard } from "./ItemCard";

/** Weighted effort points per size (the timeline's per-milestone workload signal). */
const EFFORT_POINTS: Record<string, number> = { S: 1, M: 2, L: 3, XL: 5 };

function isClosed(item: RoadmapItemOut): boolean {
  return item.status === "done";
}

/**
 * The linear milestone rail: ordinal milestones left→right, each with progress
 * and effort totals. Pure CSS on purpose — milestones have no dates, so a
 * charting library would only fight us. Clicking a milestone selects it and
 * shows its items below the rail.
 */
export function MilestoneTimeline({
  roadmap,
  blockedIds,
  selectedMilestoneId,
  onSelectMilestone,
  onOpenItem,
}: {
  roadmap: RoadmapDetailOut;
  blockedIds: Set<string>;
  selectedMilestoneId?: string;
  onSelectMilestone: (milestoneId?: string) => void;
  onOpenItem: (itemId: string) => void;
}) {
  const { t } = useTranslation();
  const repos = useMemo(
    () => new Map(roadmap.repositories.map((r) => [r.id, r])),
    [roadmap.repositories],
  );

  const byMilestone = useMemo(() => {
    const grouped = new Map<string | null, RoadmapItemOut[]>();
    for (const item of roadmap.items) {
      const key = item.milestone_id ?? null;
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
    return grouped;
  }, [roadmap.items]);

  const stats = roadmap.milestones.map((milestone) => {
    const items = byMilestone.get(milestone.id) ?? [];
    const done = items.filter((i) => i.status === "done").length;
    const closed = items.filter(isClosed).length;
    const points = items.reduce(
      (sum, i) => sum + (i.effort ? (EFFORT_POINTS[i.effort] ?? 0) : 0),
      0,
    );
    return {
      milestone,
      items,
      done,
      complete: items.length > 0 && closed === items.length,
      points,
    };
  });

  // The selected milestone, or the first incomplete one so the rail is never just chrome.
  const selected =
    stats.find((s) => s.milestone.id === selectedMilestoneId) ??
    stats.find((s) => !s.complete) ??
    stats[0];

  if (stats.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {t("roadmaps.timeline.empty")}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden">
        <div className="flex items-stretch overflow-x-auto pb-2">
          {stats.map(({ milestone, items, done, complete, points }, index) => (
            <div key={milestone.id} className="flex items-center">
              {index > 0 ? (
                <div
                  className={cn(
                    "h-0.5 w-8 flex-none",
                    stats[index - 1].complete ? "bg-primary" : "bg-border",
                  )}
                />
              ) : null}
              <button
                type="button"
                onClick={() =>
                  onSelectMilestone(
                    selectedMilestoneId === milestone.id
                      ? undefined
                      : milestone.id,
                  )
                }
                className="text-left"
              >
                <Card
                  className={cn(
                    "w-72 shrink-0 gap-2 p-4 transition-colors",
                    selected?.milestone.id === milestone.id
                      ? "border-primary/60"
                      : "hover:border-primary/30",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                        complete
                          ? "bg-primary text-primary-foreground"
                          : "border border-border text-muted-foreground",
                      )}
                    >
                      {index + 1}
                    </span>
                    <p className="truncate text-sm font-semibold">
                      {milestone.title}
                    </p>
                  </div>
                  {milestone.summary ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {milestone.summary}
                    </p>
                  ) : null}
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${items.length ? Math.round((done / items.length) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("roadmaps.timeline.progress", {
                      done,
                      total: items.length,
                    })}
                    {points > 0
                      ? ` · ${t("roadmaps.timeline.points", { points })}`
                      : ""}
                  </p>
                </Card>
              </button>
            </div>
          ))}
        </div>
      </div>

      {selected ? (
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">
            {selected.milestone.title}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {selected.items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                repo={
                  item.repository_id ? repos.get(item.repository_id) : undefined
                }
                isBlocked={blockedIds.has(item.id)}
                onOpen={onOpenItem}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
