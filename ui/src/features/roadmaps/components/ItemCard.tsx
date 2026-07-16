import { LockIcon, RotateCcwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { RoadmapItemOut, RoadmapRepoRefOut } from "@/lib/api";
import { cn } from "@/lib/utils";
import { EffortBadge, ItemStatusBadge, LabelBadge } from "./chips";

/**
 * One roadmap item as a card — used by the kanban board (draggable) and
 * the milestone timeline. Click opens the item dialog via the `item` URL param.
 */
export function ItemCard({
  item,
  repo,
  isBlocked,
  draggable = false,
  onOpen,
  className,
}: {
  item: RoadmapItemOut;
  repo?: RoadmapRepoRefOut;
  /** Any unresolved blocking dependency (computed by the caller from the item set). */
  isBlocked?: boolean;
  draggable?: boolean;
  onOpen: (itemId: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", item.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onOpen(item.id)}
      className={cn(
        "w-full rounded-lg border border-border bg-background p-3 text-left text-sm shadow-xs transition-colors hover:border-primary/40",
        draggable && "cursor-grab active:cursor-grabbing",
        item.status === "done" && "opacity-60",
        className,
      )}
    >
      <p className="font-medium leading-snug">{item.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <LabelBadge label={item.label} />
        <EffortBadge effort={item.effort} />
        <ItemStatusBadge status={item.status} />
        {repo ? (
          <span className="max-w-40 truncate rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
            {repo.name}
          </span>
        ) : null}
        {isBlocked ? (
          <span
            className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
            title={t("roadmaps.item.blocked_hint")}
          >
            <LockIcon className="size-3" />
            {item.depends_on.length}
          </span>
        ) : null}
        {item.carried_over ? (
          <span
            className="inline-flex items-center text-xs text-muted-foreground"
            title={t("roadmaps.item.carried_hint")}
          >
            <RotateCcwIcon className="size-3" />
          </span>
        ) : null}
      </div>
    </button>
  );
}
