import {
  CheckIcon,
  FilterIcon,
  MaximizeIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  GraphCanvas,
  type GraphCanvasRef,
  type GraphEdge,
  type GraphNode,
  lightTheme,
  type Theme,
  useSelection,
} from "reagraph";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useTeamsQuery } from "@/features/teams/api";
import type { ContributionsGraphOut } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useContributionsGraphQuery } from "../api";
import { renderGraphNode } from "./graphSymbols";

const UNASSIGNED_COLOR = "#94a3b8"; // slate-400
const REPO_COLOR = "#f59e0b"; // amber-500 (matches the star)
const REPO_CLUSTER = "Repositories";

interface BuildOptions {
  showUnassigned: boolean;
  groupByTeam: boolean;
  hiddenRepoIds: Set<string>;
  percentile: number;
}

/** Keep only members at/above the p-th percentile of commit volume (p=0 keeps everyone). */
function abovePercentile<T extends { commits: number }>(
  members: T[],
  p: number,
): T[] {
  if (p <= 0 || members.length === 0) return members;
  const sorted = members.map((m) => m.commits).sort((a, b) => a - b);
  const cutoff =
    sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  return members.filter((m) => m.commits >= cutoff);
}

/** Filter + shape the payload into reagraph nodes/edges. */
function buildGraph(
  graph: ContributionsGraphOut,
  opts: BuildOptions,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const members = abovePercentile(
    graph.members.filter((m) => opts.showUnassigned || m.team),
    opts.percentile,
  );
  const memberIds = new Set(members.map((m) => m.id));
  const rawEdges = graph.edges.filter(
    (e) =>
      memberIds.has(e.member_id) && !opts.hiddenRepoIds.has(e.repository_id),
  );
  const usedRepos = new Set(rawEdges.map((e) => e.repository_id));
  const repos = graph.repositories.filter((r) => usedRepos.has(r.id));

  const memberMax = Math.max(1, ...members.map((m) => m.commits));
  const repoMax = Math.max(1, ...repos.map((r) => r.commits));
  const edgeMax = Math.max(1, ...rawEdges.map((e) => e.commits));
  const colorOf = new Map(
    members.map((m) => [m.id, m.team?.color ?? UNASSIGNED_COLOR]),
  );

  const nodes: GraphNode[] = [
    ...members.map((m) => ({
      id: `m:${m.id}`,
      label: m.name,
      fill: m.team?.color ?? UNASSIGNED_COLOR,
      size: 4 + 12 * Math.sqrt(m.commits / memberMax),
      data: { kind: "member", cluster: m.team?.name ?? "Unassigned" },
    })),
    ...repos.map((r) => ({
      id: `r:${r.id}`,
      label: r.name,
      fill: REPO_COLOR,
      size: 12 + 14 * Math.sqrt(r.commits / repoMax),
      data: { kind: "repo", cluster: REPO_CLUSTER },
    })),
  ];

  const edges: GraphEdge[] = rawEdges.map((e, i) => ({
    id: `e${i}`,
    source: `m:${e.member_id}`,
    target: `r:${e.repository_id}`,
    label: String(e.commits),
    size: 1 + 4 * (e.commits / edgeMax),
    fill: colorOf.get(e.member_id) ?? UNASSIGNED_COLOR,
  }));

  return { nodes, edges };
}

/** A labelled switch row for the Display popover. */
function ToggleRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex items-center justify-between gap-4 py-1.5 text-sm",
        disabled && "opacity-50",
      )}
    >
      {label}
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={label}
      />
    </span>
  );
}

export function ContributionsGraphTab({ anonymize }: { anonymize: boolean }) {
  const { t } = useTranslation();
  const { data: teams } = useTeamsQuery();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [includeSubrepos, setIncludeSubrepos] = useState(true);
  const [groupByTeam, setGroupByTeam] = useState(true);
  const [teamBorders, setTeamBorders] = useState(true);
  const [showCommitLabels, setShowCommitLabels] = useState(false);
  const [hiddenRepoIds, setHiddenRepoIds] = useState<Set<string>>(new Set());
  const [percentile, setPercentile] = useState(0);
  // null = follow the smart default (hide the unassigned crowd once any team exists).
  const [showUnassignedOverride, setShowUnassignedOverride] = useState<
    boolean | null
  >(null);

  const { data, isPending, isError } = useContributionsGraphQuery({
    teamId,
    includeSubrepos,
    anonymize,
  });
  const graphRef = useRef<GraphCanvasRef | null>(null);

  const showUnassigned =
    showUnassignedOverride ?? (data ? data.teams.length === 0 : true);

  const { nodes, edges } = useMemo(
    () =>
      data
        ? buildGraph(data, {
            showUnassigned,
            groupByTeam,
            hiddenRepoIds,
            percentile,
          })
        : { nodes: [], edges: [] },
    [data, showUnassigned, groupByTeam, hiddenRepoIds, percentile],
  );

  // Click a node to highlight its direct connections (a repo lights up all its contributor lines).
  const { selections, actives, onNodeClick, onCanvasClick } = useSelection({
    ref: graphRef,
    nodes,
    edges,
    pathSelectionType: "direct",
    type: "single",
    focusOnSelect: false,
  });

  // Reframe the graph to fill the pane whenever the visible set changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `nodes` is the intended trigger — refit after the node set (and thus the layout) changes, even though the body only touches the ref.
  useEffect(() => {
    const id = setTimeout(() => graphRef.current?.fitNodesInView(), 400);
    return () => clearTimeout(id);
  }, [nodes]);

  // Team circles are toggled by swapping the cluster stroke in/out of the theme.
  const theme = useMemo<Theme>(
    () => ({
      ...lightTheme,
      cluster: {
        ...lightTheme.cluster,
        stroke: teamBorders ? "#94a3b8" : "transparent",
        fill: "transparent",
      },
    }),
    [teamBorders],
  );

  const allRepos = data?.repositories ?? [];
  const visibleRepoCount = allRepos.filter(
    (r) => !hiddenRepoIds.has(r.id),
  ).length;
  const toggleRepo = (id: string) =>
    setHiddenRepoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={teamId ?? "all"}
            onValueChange={(v) => setTeamId(!v || v === "all" ? null : v)}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder={t("members.graph.all_teams")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t("members.graph.all_teams")}
              </SelectItem>
              {(teams ?? []).map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="size-3 rounded-full"
                      style={{ backgroundColor: team.color }}
                    />
                    {team.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Repositories show/skip filter */}
          <Popover>
            <PopoverTrigger
              render={
                <Button type="button" variant="outline" size="sm">
                  <FilterIcon className="size-4" />
                  {t("members.graph.repos_button", {
                    shown: visibleRepoCount,
                    total: allRepos.length,
                  })}
                </Button>
              }
            />
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder={t("members.graph.repos_search")} />
                <CommandList>
                  <CommandEmpty>{t("members.graph.repos_empty")}</CommandEmpty>
                  <CommandGroup>
                    {allRepos.map((r) => {
                      const shown = !hiddenRepoIds.has(r.id);
                      return (
                        <CommandItem
                          key={r.id}
                          value={r.name}
                          onSelect={() => toggleRepo(r.id)}
                        >
                          <CheckIcon
                            className={cn(
                              "mr-2 size-4",
                              shown ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="truncate">{r.name}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
                <div className="flex justify-between border-t border-border p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setHiddenRepoIds(new Set())}
                  >
                    {t("members.graph.repos_all")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setHiddenRepoIds(new Set(allRepos.map((r) => r.id)))
                    }
                  >
                    {t("members.graph.repos_none")}
                  </Button>
                </div>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Display options */}
          <Popover>
            <PopoverTrigger
              render={
                <Button type="button" variant="outline" size="sm">
                  <SlidersHorizontalIcon className="size-4" />
                  {t("members.graph.display")}
                </Button>
              }
            />
            <PopoverContent className="w-64" align="start">
              <ToggleRow
                label={t("members.graph.group_by_team")}
                checked={groupByTeam}
                onChange={setGroupByTeam}
              />
              <ToggleRow
                label={t("members.graph.team_circles")}
                checked={teamBorders}
                onChange={setTeamBorders}
                disabled={!groupByTeam}
              />
              <ToggleRow
                label={t("members.graph.include_subrepos")}
                checked={includeSubrepos}
                onChange={setIncludeSubrepos}
              />
              <ToggleRow
                label={t("members.graph.show_unassigned")}
                checked={showUnassigned}
                onChange={setShowUnassignedOverride}
              />
              <ToggleRow
                label={t("members.graph.commit_labels")}
                checked={showCommitLabels}
                onChange={setShowCommitLabels}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {percentile > 0
                ? t("members.graph.percentile_on", { p: percentile })
                : t("members.graph.percentile_off")}
            </span>
            <Slider
              className="w-36"
              value={percentile}
              min={0}
              max={99}
              step={1}
              onValueChange={(v) => setPercentile(Array.isArray(v) ? v[0] : v)}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => graphRef.current?.fitNodesInView()}
          >
            <MaximizeIcon className="size-4" />
            {t("members.graph.fit")}
          </Button>
        </div>
      </div>

      {data && data.teams.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {data.teams.map((team) => (
            <Badge
              key={team.id}
              variant="outline"
              className="gap-1.5 border-foreground/10"
            >
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: team.color }}
              />
              {team.name}
            </Badge>
          ))}
        </div>
      ) : null}

      <Card className="h-[calc(100vh-15rem)] min-h-[520px] overflow-hidden p-0">
        {isError ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("common.states.api_unreachable", { message: "" })}
          </div>
        ) : isPending || !data ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("members.graph.loading")}
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("members.graph.empty")}
          </div>
        ) : (
          // reagraph fills its positioned container.
          <div className="relative h-full w-full">
            <GraphCanvas
              ref={graphRef}
              nodes={nodes}
              edges={edges}
              selections={selections}
              actives={actives}
              onNodeClick={onNodeClick}
              onCanvasClick={onCanvasClick}
              renderNode={renderGraphNode}
              clusterAttribute={groupByTeam ? "cluster" : undefined}
              layoutType="forceDirected2d"
              sizingType="default"
              labelType={showCommitLabels ? "all" : "auto"}
              edgeLabelPosition="natural"
              edgeArrowPosition="none"
              draggable
              theme={theme}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
