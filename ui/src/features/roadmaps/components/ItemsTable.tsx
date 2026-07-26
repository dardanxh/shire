import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DataTable } from "@/components/shared/DataTable";
import { Card } from "@/components/ui/card";
import type { RoadmapDetailOut, RoadmapItemOut } from "@/lib/api";
import { cn } from "@/lib/utils";
import { EffortBadge, ItemStatusBadge, LabelBadge } from "./chips";

/**
 * The flat item table with a milestone filter (fed by the `milestone` URL
 * param via the timeline's click-through). Row click opens the item dialog.
 */
export function ItemsTable({
  roadmap,
  milestoneFilter,
  onMilestoneFilterChange,
  onOpenItem,
}: {
  roadmap: RoadmapDetailOut;
  milestoneFilter?: string;
  onMilestoneFilterChange: (milestoneId?: string) => void;
  onOpenItem: (itemId: string) => void;
}) {
  const { t } = useTranslation();
  const repos = useMemo(
    () => new Map(roadmap.repositories.map((r) => [r.id, r])),
    [roadmap.repositories],
  );
  const milestones = useMemo(
    () => new Map(roadmap.milestones.map((m) => [m.id, m])),
    [roadmap.milestones],
  );

  const rows = roadmap.items.filter(
    (item) => !milestoneFilter || item.milestone_id === milestoneFilter,
  );

  const columns: ColumnDef<RoadmapItemOut>[] = [
    {
      accessorKey: "title",
      header: t("roadmaps.items.col_title"),
      cell: ({ row }) => (
        <span className="font-medium">{row.original.title}</span>
      ),
    },
    {
      accessorKey: "label",
      header: t("roadmaps.items.col_label"),
      cell: ({ row }) => <LabelBadge label={row.original.label} />,
    },
    {
      accessorKey: "status",
      header: t("roadmaps.items.col_status"),
      cell: ({ row }) => <ItemStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "quadrant",
      header: t("roadmaps.items.col_priority"),
      cell: ({ row }) => t(`roadmaps.matrix.q_${row.original.quadrant}`),
    },
    {
      accessorKey: "effort",
      header: t("roadmaps.items.col_effort"),
      cell: ({ row }) => <EffortBadge effort={row.original.effort} />,
    },
    {
      id: "repository",
      header: t("roadmaps.items.col_repository"),
      cell: ({ row }) =>
        row.original.repository_id
          ? (repos.get(row.original.repository_id)?.name ?? "—")
          : t("roadmaps.items.portfolio_wide"),
    },
    {
      id: "milestone",
      header: t("roadmaps.items.col_milestone"),
      cell: ({ row }) =>
        row.original.milestone_id
          ? (milestones.get(row.original.milestone_id)?.title ?? "—")
          : "—",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {roadmap.milestones.map((milestone, index) => (
          <button
            key={milestone.id}
            type="button"
            onClick={() =>
              onMilestoneFilterChange(
                milestoneFilter === milestone.id ? undefined : milestone.id,
              )
            }
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
              milestoneFilter === milestone.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            M{index + 1} · {milestone.title}
          </button>
        ))}
      </div>
      <Card className="overflow-hidden p-0">
        <DataTable
          columns={columns}
          data={rows}
          onRowClick={(row) => onOpenItem(row.id)}
          emptyState={
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("roadmaps.items.empty")}
            </p>
          }
        />
      </Card>
    </div>
  );
}
