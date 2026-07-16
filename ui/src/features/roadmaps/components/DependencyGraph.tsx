import { LockIcon, PlayIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { RoadmapDetailOut, RoadmapItemOut } from "@/lib/api";
import { cn } from "@/lib/utils";
import { EffortBadge, ItemStatusBadge, LabelBadge } from "./chips";

const NODE_W = 260;
const NODE_H = 104;
const GAP_X = 72;
const GAP_Y = 20;
const PAD = 12;

type Positioned = {
  item: RoadmapItemOut;
  layer: number;
  x: number;
  y: number;
};

/**
 * The dependency DAG: items laid out left→right by dependency depth (layer 0 =
 * nothing blocks it), edges from blocker to blocked. Reading order IS the
 * execution order — unblocked open items carry a "Ready" marker. Layout is
 * computed (longest path from the roots), so no measuring or graph library.
 */
export function DependencyGraph({
  roadmap,
  blockedIds,
  onOpenItem,
}: {
  roadmap: RoadmapDetailOut;
  blockedIds: Set<string>;
  onOpenItem: (itemId: string) => void;
}) {
  const { t } = useTranslation();
  const repos = useMemo(
    () => new Map(roadmap.repositories.map((r) => [r.id, r])),
    [roadmap.repositories],
  );

  const { nodes, edges, width, height } = useMemo(() => {
    const byId = new Map(roadmap.items.map((i) => [i.id, i]));

    // Layer = longest dependency chain below the item (memoized DFS; the
    // backend rejects cycles, but a visited guard keeps a bad payload safe).
    const layers = new Map<string, number>();
    const resolving = new Set<string>();
    const layerOf = (id: string): number => {
      const known = layers.get(id);
      if (known !== undefined) return known;
      if (resolving.has(id)) return 0;
      resolving.add(id);
      const item = byId.get(id);
      const deps = (item?.depends_on ?? []).filter((d) => byId.has(d));
      const layer = deps.length
        ? Math.max(...deps.map((d) => layerOf(d))) + 1
        : 0;
      resolving.delete(id);
      layers.set(id, layer);
      return layer;
    };

    const columns = new Map<number, RoadmapItemOut[]>();
    for (const item of roadmap.items) {
      const layer = layerOf(item.id);
      columns.set(layer, [...(columns.get(layer) ?? []), item]);
    }

    const nodes = new Map<string, Positioned>();
    for (const [layer, items] of columns) {
      items.sort((a, b) => a.position - b.position);
      items.forEach((item, index) => {
        nodes.set(item.id, {
          item,
          layer,
          x: PAD + layer * (NODE_W + GAP_X),
          y: PAD + index * (NODE_H + GAP_Y),
        });
      });
    }

    const edges: Array<{
      from: Positioned;
      to: Positioned;
      resolved: boolean;
    }> = [];
    for (const node of nodes.values()) {
      for (const depId of node.item.depends_on) {
        const from = nodes.get(depId);
        if (from) {
          edges.push({ from, to: node, resolved: from.item.status === "done" });
        }
      }
    }

    const layerCount = Math.max(...[...columns.keys()], 0) + 1;
    const maxRows = Math.max(...[...columns.values()].map((c) => c.length), 1);
    return {
      nodes: [...nodes.values()],
      edges,
      width: PAD * 2 + layerCount * NODE_W + (layerCount - 1) * GAP_X,
      height: PAD * 2 + maxRows * NODE_H + (maxRows - 1) * GAP_Y,
    };
  }, [roadmap.items]);

  if (nodes.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {t("roadmaps.items.empty")}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <PlayIcon className="size-3 text-emerald-600 dark:text-emerald-400" />
          {t("roadmaps.graph.legend_ready")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <LockIcon className="size-3 text-amber-600 dark:text-amber-400" />
          {t("roadmaps.graph.legend_blocked")}
        </span>
        <span>{t("roadmaps.graph.legend_order")}</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="overflow-auto">
          <div className="relative" style={{ width, height }}>
            <svg
              width={width}
              height={height}
              className="pointer-events-none absolute inset-0"
              aria-hidden
            >
              <title>{t("roadmaps.graph.legend_order")}</title>
              {edges.map(({ from, to, resolved }) => {
                const x1 = from.x + NODE_W;
                const y1 = from.y + NODE_H / 2;
                const x2 = to.x;
                const y2 = to.y + NODE_H / 2;
                const bend = Math.max((x2 - x1) / 2, 24);
                return (
                  <path
                    key={`${from.item.id}-${to.item.id}`}
                    d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke={
                      resolved ? "var(--chart-1)" : "var(--muted-foreground)"
                    }
                    strokeWidth={1.5}
                    strokeDasharray={resolved ? undefined : "5 4"}
                    opacity={0.6}
                  />
                );
              })}
            </svg>

            {nodes.map(({ item, x, y }) => {
              const blocked = blockedIds.has(item.id);
              const ready = !blocked && item.status === "todo";
              const repo = item.repository_id
                ? repos.get(item.repository_id)
                : undefined;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenItem(item.id)}
                  style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
                  className={cn(
                    "absolute rounded-lg border bg-background p-3 text-left text-sm shadow-xs transition-colors hover:border-primary/40",
                    ready ? "border-emerald-500/50" : "border-border",
                    item.status === "done" && "opacity-60",
                  )}
                >
                  <p className="line-clamp-2 text-sm font-medium leading-snug">
                    {item.title}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <LabelBadge label={item.label} />
                    <EffortBadge effort={item.effort} />
                    <ItemStatusBadge status={item.status} />
                    {repo ? (
                      <span className="max-w-24 truncate text-xs text-muted-foreground">
                        {repo.name}
                      </span>
                    ) : null}
                    {ready ? (
                      <PlayIcon className="size-3 text-emerald-600 dark:text-emerald-400" />
                    ) : null}
                    {blocked ? (
                      <LockIcon className="size-3 text-amber-600 dark:text-amber-400" />
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
