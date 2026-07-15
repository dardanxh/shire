import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { MergeReviewFootprint } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Which areas of the codebase the MR lands in. A dependency-free flex heatmap:
 * tile size grows with the directory's changed lines, background intensity
 * scales with the same signal. (Recharts' Treemap custom-content API is its
 * least polished corner — this reads better and costs ~40 lines.)
 */
export function DirectoryHeatmap({
  footprint,
}: {
  footprint: MergeReviewFootprint;
}) {
  const { t } = useTranslation();

  const tiles = useMemo(() => {
    const dirs = footprint.directories.map((d) => ({
      ...d,
      changed: d.additions + d.deletions,
    }));
    const max = Math.max(1, ...dirs.map((d) => d.changed));
    return dirs.map((d) => ({ ...d, intensity: d.changed / max }));
  }, [footprint.directories]);

  if (tiles.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {tiles.map((tile) => (
        <div
          key={tile.directory}
          title={`${tile.directory} — ${t("merge_reviews.size.facts_short", {
            files: tile.files_changed,
            additions: tile.additions,
            deletions: tile.deletions,
          })}`}
          style={{
            flexGrow: Math.max(1, tile.changed),
            flexBasis: `${Math.max(12, tile.intensity * 40)}%`,
            background: `color-mix(in srgb, var(--chart-1) ${Math.round(
              12 + tile.intensity * 68,
            )}%, var(--muted))`,
          }}
          className={cn(
            "min-w-24 rounded-md px-3 py-2",
            tile.intensity > 0.45
              ? "text-primary-foreground"
              : "text-foreground",
          )}
        >
          <p className="truncate font-mono text-xs font-medium">
            {tile.directory}
          </p>
          <p className="text-[11px] tabular-nums opacity-80">
            {tile.files_changed} · +{tile.additions}/−{tile.deletions}
          </p>
        </div>
      ))}
    </div>
  );
}
