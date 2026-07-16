import {
  CircleDotIcon,
  DownloadIcon,
  GitPullRequestIcon,
  RadarIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  isGenerating,
  useExportIssuesMutation,
  useRefreshPrsMutation,
  useRoadmapQuery,
  useRoadmapVersionsQuery,
  useRunDriftMutation,
} from "../api";
import type { RoadmapTab } from "../tabs";
import { DependencyGraph } from "./DependencyGraph";
import { DriftBanner } from "./DriftBanner";
import { GenerationProgress } from "./GenerationProgress";
import { InsightsPanel } from "./InsightsPanel";
import { ItemDialog } from "./ItemDialog";
import { ItemsTable } from "./ItemsTable";
import { KanbanBoard } from "./KanbanBoard";
import { MilestoneTimeline } from "./MilestoneTimeline";
import { RegenerateDialog } from "./RegenerateDialog";

/**
 * The roadmap detail: header (version switcher + actions), the four tabs, and
 * the item dialog driven by the `item` URL param. The detail query self-polls
 * while a generation is in flight.
 */
export function RoadmapViewPage({
  id,
  tab,
  version,
  itemId,
  milestoneId,
  onTabChange,
  onVersionChange,
  onOpenItem,
  onCloseItem,
  onSelectMilestone,
}: {
  id: string;
  tab: RoadmapTab;
  version?: number;
  itemId?: string;
  milestoneId?: string;
  onTabChange: (tab: RoadmapTab) => void;
  onVersionChange: (version?: number) => void;
  onOpenItem: (itemId: string) => void;
  onCloseItem: () => void;
  onSelectMilestone: (milestoneId?: string) => void;
}) {
  const { t } = useTranslation();
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const { data: roadmap, isPending } = useRoadmapQuery(id, version);
  const { data: versions } = useRoadmapVersionsQuery(id);
  const { mutate: refreshPrs, isPending: isRefreshingPrs } =
    useRefreshPrsMutation(id);
  const { mutate: runDrift, isPending: isStartingDrift } =
    useRunDriftMutation(id);
  const { mutate: exportIssues, isPending: isExportingIssues } =
    useExportIssuesMutation(id);

  // Old versions are immutable history — every mutation control disables.
  const newestReady = versions?.find((v) => v.status === "ready")?.number;
  const readOnly =
    version !== undefined &&
    newestReady !== undefined &&
    version !== newestReady;

  const blockedIds = useMemo(() => {
    if (!roadmap) return new Set<string>();
    const byId = new Map(roadmap.items.map((i) => [i.id, i]));
    return new Set(
      roadmap.items
        .filter((item) =>
          item.depends_on.some((depId) => {
            const dep = byId.get(depId);
            return dep && dep.status !== "done";
          }),
        )
        .map((item) => item.id),
    );
  }, [roadmap]);

  const handleExport = async () => {
    const response = await fetch(`/api/v1/roadmaps/${id}/export/markdown`);
    if (!response.ok) {
      toast.error(t("roadmaps.export.failed"));
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      response.headers
        .get("Content-Disposition")
        ?.match(/filename="(.+)"/)?.[1] ?? "roadmap.md";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (isPending || !roadmap) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const showPlan = roadmap.version !== null && roadmap.version !== undefined;
  const generation = roadmap.generation;

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">
            {roadmap.name}
          </h1>
          {roadmap.goal ? (
            <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
              {roadmap.goal}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1">
            {roadmap.repositories.map((repo) => (
              <span
                key={repo.id}
                className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
              >
                {repo.slug}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {versions &&
          versions.filter((v) => v.status === "ready").length > 1 ? (
            <Select
              value={String(roadmap.version?.number ?? "")}
              onValueChange={(value) => {
                const number = Number(value);
                onVersionChange(
                  number === versions[0]?.number ? undefined : number,
                );
              }}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versions
                  .filter((v) => v.status === "ready")
                  .map((v) => (
                    <SelectItem key={v.id} value={String(v.number)}>
                      v{v.number}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              runDrift(undefined, {
                onSuccess: (checks) =>
                  toast.success(
                    t("roadmaps.drift.started", { count: checks.length }),
                  ),
              })
            }
            disabled={!showPlan || isStartingDrift || readOnly}
          >
            <RadarIcon className="size-3.5" />
            {t("roadmaps.view.check_drift")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportIssues(undefined, {
                onSuccess: (result) =>
                  toast.success(
                    t("roadmaps.view.issues_done", {
                      created: result.created,
                      skipped: result.skipped,
                    }),
                  ),
              })
            }
            disabled={!showPlan || isExportingIssues || readOnly}
          >
            <CircleDotIcon className="size-3.5" />
            {t("roadmaps.view.create_issues")}
          </Button>
          {roadmap.items.some((item) => item.execution?.pr_state === "open") ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                refreshPrs(undefined, {
                  onSuccess: (result) =>
                    toast.success(
                      t("roadmaps.view.sync_prs_done", {
                        count: result.updated_item_ids.length,
                      }),
                    ),
                })
              }
              disabled={isRefreshingPrs || readOnly}
            >
              <GitPullRequestIcon className="size-3.5" />
              {t("roadmaps.view.sync_prs")}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={!showPlan}
          >
            <DownloadIcon className="size-3.5" />
            {t("roadmaps.view.export_md")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRegenerateOpen(true)}
            disabled={isGenerating(roadmap) || readOnly}
          >
            <RefreshCwIcon className="size-3.5" />
            {t("roadmaps.view.regenerate")}
          </Button>
        </div>
      </div>

      {readOnly ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          {t("roadmaps.view.read_only_banner", {
            number: roadmap.version?.number,
          })}
        </div>
      ) : null}

      {generation ? (
        <GenerationProgress
          generation={generation}
          onRetry={() => setRegenerateOpen(true)}
          isRetrying={false}
          compact={showPlan}
        />
      ) : null}

      {showPlan ? <DriftBanner roadmapId={id} readOnly={readOnly} /> : null}

      {showPlan ? (
        <Tabs
          value={tab}
          onValueChange={(value) => onTabChange(value as RoadmapTab)}
        >
          <TabsList>
            <TabsTrigger value="board">{t("roadmaps.tabs.board")}</TabsTrigger>
            <TabsTrigger value="graph">{t("roadmaps.tabs.graph")}</TabsTrigger>
            <TabsTrigger value="timeline">
              {t("roadmaps.tabs.timeline")}
            </TabsTrigger>
            <TabsTrigger value="items">{t("roadmaps.tabs.items")}</TabsTrigger>
            <TabsTrigger value="insights">
              {t("roadmaps.tabs.insights")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="board" className="pt-3">
            <KanbanBoard
              roadmap={roadmap}
              blockedIds={blockedIds}
              readOnly={readOnly}
              onOpenItem={onOpenItem}
            />
          </TabsContent>
          <TabsContent value="graph" className="pt-3">
            <DependencyGraph
              roadmap={roadmap}
              blockedIds={blockedIds}
              onOpenItem={onOpenItem}
            />
          </TabsContent>
          <TabsContent value="timeline" className="pt-3">
            <MilestoneTimeline
              roadmap={roadmap}
              blockedIds={blockedIds}
              selectedMilestoneId={milestoneId}
              onSelectMilestone={onSelectMilestone}
              onOpenItem={onOpenItem}
            />
          </TabsContent>
          <TabsContent value="items" className="pt-3">
            <ItemsTable
              roadmap={roadmap}
              milestoneFilter={milestoneId}
              onMilestoneFilterChange={onSelectMilestone}
              onOpenItem={onOpenItem}
            />
          </TabsContent>
          <TabsContent value="insights" className="pt-3">
            <InsightsPanel roadmap={roadmap} />
          </TabsContent>
        </Tabs>
      ) : null}

      <ItemDialog
        roadmap={roadmap}
        itemId={itemId ?? null}
        readOnly={readOnly}
        onOpenItem={onOpenItem}
        onClose={onCloseItem}
      />
      <RegenerateDialog
        roadmapId={id}
        open={regenerateOpen}
        onOpenChange={setRegenerateOpen}
      />
    </div>
  );
}
