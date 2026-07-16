import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Card } from "@/components/ui/card";
import {
  ROADMAP_ITEM_STATUSES,
  type RoadmapDetailOut,
  type RoadmapItemStatus,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { useUpdateRoadmapItemMutation } from "../api";
import { ItemCard } from "./ItemCard";

/**
 * The ticket board: one native-DnD column per status. A drop PATCHes the
 * status optimistically — and since todo → in progress auto-dispatches the AI
 * implementation, dragging a card right literally starts the work.
 */
export function KanbanBoard({
  roadmap,
  blockedIds,
  readOnly,
  onOpenItem,
}: {
  roadmap: RoadmapDetailOut;
  blockedIds: Set<string>;
  readOnly: boolean;
  onOpenItem: (itemId: string) => void;
}) {
  const { t } = useTranslation();
  const [repoFilter, setRepoFilter] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<RoadmapItemStatus | null>(null);
  const { mutate: updateItem } = useUpdateRoadmapItemMutation(roadmap.id);

  const repos = useMemo(
    () => new Map(roadmap.repositories.map((r) => [r.id, r])),
    [roadmap.repositories],
  );
  const visible = roadmap.items.filter(
    (item) => repoFilter === null || item.repository_id === repoFilter,
  );

  const handleDrop = (status: RoadmapItemStatus) => {
    return (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(null);
      if (readOnly) return;
      const itemId = e.dataTransfer.getData("text/plain");
      const item = roadmap.items.find((i) => i.id === itemId);
      if (!item || item.status === status) return;
      updateItem({ itemId, body: { status } });
    };
  };

  return (
    <div className="space-y-3">
      {roadmap.repositories.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {roadmap.repositories.map((repo) => (
            <button
              key={repo.id}
              type="button"
              onClick={() =>
                setRepoFilter((current) =>
                  current === repo.id ? null : repo.id,
                )
              }
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                repoFilter === repo.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {repo.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {ROADMAP_ITEM_STATUSES.map((status) => {
          const items = visible.filter((item) => item.status === status);
          return (
            <Card
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDragEnter={() => setDragOver(status)}
              onDragLeave={() => setDragOver(null)}
              onDrop={handleDrop(status)}
              className={cn(
                "gap-2 p-3 transition-shadow",
                dragOver === status && !readOnly && "ring-2 ring-primary/40",
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {t(`roadmaps.item_status.${status}`)}
                </p>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {items.length}
                </span>
              </div>
              <div className="min-h-48 space-y-2">
                {items.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    repo={
                      item.repository_id
                        ? repos.get(item.repository_id)
                        : undefined
                    }
                    isBlocked={blockedIds.has(item.id)}
                    draggable={!readOnly}
                    onOpen={onOpenItem}
                  />
                ))}
                {items.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    {t("roadmaps.board.empty_column")}
                  </p>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
