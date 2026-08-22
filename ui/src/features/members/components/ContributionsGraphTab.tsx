import {
  FilterIcon,
  MaximizeIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  XIcon,
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
const EDGE_WIDTH = 1.5; // uniform — commit magnitude lives on the label, not the width
const UNASSIGNED_KEY = "unassigned";

// Spread the force layout far wider than reagraph's defaults (linkDistance 50, nodeStrength -250)
// so the graph fills a large world area. reagraph's fit uses a fixed 50-unit world padding, which
// is then a negligible margin — the graph frames edge-to-edge instead of floating in the middle.
const LAYOUT_OVERRIDES = { linkDistance: 220, nodeStrength: -1100 } as const;

type ViewMode = "people" | "teams";

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

type RepoScope = "repo" | "subrepo";
type RepoNode = ContributionsGraphOut["repositories"][number];

/** Resolve which repository nodes to show and remap edges accordingly.
 *
 * - `repo` scope: exactly one star per repo family (root + all subpaths folded into one). Uses the
 *   whole-repo root record when present to avoid the root/subpath commit overlap.
 * - `subrepo` scope: for a family WITH subpaths, show each subpath and drop the root; a family with
 *   no subpaths shows the repo itself. Edges to dropped records are dropped.
 */
function scopeRepos(
  graph: ContributionsGraphOut,
  scope: RepoScope,
): ContributionsGraphOut {
  const familyLabel = (fam: string, fallback: string) => {
    const parts = fam.split("/");
    return parts.length > 1 ? parts.slice(1).join("/") : fallback;
  };

  const families = new Map<string, RepoNode[]>();
  for (const r of graph.repositories) {
    const fam = r.family || r.name || r.id;
    const list = families.get(fam);
    if (list) list.push(r);
    else families.set(fam, [r]);
  }

  const kept = new Map<string, RepoNode>();
  const remap = new Map<string, string>(); // original repo id -> shown node id (missing = drop)

  for (const [fam, group] of families) {
    const subs = group.filter((r) => r.subpath);
    const roots = group.filter((r) => !r.subpath);
    if (scope === "subrepo" && subs.length > 0) {
      for (const s of subs) {
        kept.set(s.id, { ...s });
        remap.set(s.id, s.id);
      }
    } else {
      const src = roots.length > 0 ? roots : group;
      const nodeId = `repo:${fam}`;
      kept.set(nodeId, {
        id: nodeId,
        name: familyLabel(fam, src[0].name),
        family: fam,
        subpath: "",
        commits: src.reduce((a, r) => a + r.commits, 0),
      });
      for (const r of src) remap.set(r.id, nodeId);
    }
  }

  const agg = new Map<string, number>(); // `${memberId} ${nodeId}` -> commits
  for (const e of graph.edges) {
    const target = remap.get(e.repository_id);
    if (!target) continue;
    const key = `${e.member_id} ${target}`;
    agg.set(key, (agg.get(key) ?? 0) + e.commits);
  }
  const edges = [...agg.entries()].map(([key, commits]) => {
    const sp = key.indexOf(" ");
    return {
      member_id: key.slice(0, sp),
      repository_id: key.slice(sp + 1),
      commits,
    };
  });

  return { ...graph, repositories: [...kept.values()], edges };
}

interface PeopleOptions {
  showUnassigned: boolean;
  hiddenRepoIds: Set<string>;
  percentile: number;
}

/** Per-member nodes, coloured by team; repos as stars; uniform edge width. */
function buildPeopleGraph(
  graph: ContributionsGraphOut,
  opts: PeopleOptions,
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

  const nodes: GraphNode[] = [
    ...members.map((m) => ({
      id: `m:${m.id}`,
      label: m.name,
      fill: m.team?.color ?? UNASSIGNED_COLOR,
      size: 4 + 12 * Math.sqrt(m.commits / memberMax),
      data: { kind: "member" },
    })),
    ...repos.map((r) => ({
      id: `r:${r.id}`,
      label: r.name,
      fill: REPO_COLOR,
      size: 12 + 14 * Math.sqrt(r.commits / repoMax),
      data: { kind: "repo" },
    })),
  ];

  const edges: GraphEdge[] = rawEdges.map((e, i) => ({
    id: `e${i}`,
    source: `m:${e.member_id}`,
    target: `r:${e.repository_id}`,
    label: String(e.commits),
    size: EDGE_WIDTH,
  }));

  return { nodes, edges };
}

interface TeamOptions {
  showUnassigned: boolean;
  hiddenRepoIds: Set<string>;
}

/** One node per team (+ Unassigned), sized by total commits; edges folded to team→repo. */
function buildTeamGraph(
  graph: ContributionsGraphOut,
  opts: TeamOptions,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const teamKey = (m: ContributionsGraphOut["members"][number]) =>
    m.team?.id ?? UNASSIGNED_KEY;

  const meta = new Map<string, { name: string; color: string }>();
  const totals = new Map<string, number>();
  const memberTeam = new Map<string, string>();
  for (const m of graph.members) {
    if (!opts.showUnassigned && !m.team) continue;
    const key = teamKey(m);
    memberTeam.set(m.id, key);
    totals.set(key, (totals.get(key) ?? 0) + m.commits);
    if (!meta.has(key)) {
      meta.set(
        key,
        m.team
          ? { name: m.team.name, color: m.team.color }
          : { name: "Unassigned", color: UNASSIGNED_COLOR },
      );
    }
  }

  // Fold member→repo edges into team→repo aggregates.
  const agg = new Map<string, number>(); // `${teamKey}|${repoId}` -> commits
  for (const e of graph.edges) {
    const key = memberTeam.get(e.member_id);
    if (!key || opts.hiddenRepoIds.has(e.repository_id)) continue;
    const k = `${key}|${e.repository_id}`;
    agg.set(k, (agg.get(k) ?? 0) + e.commits);
  }

  const usedTeams = new Set<string>();
  const usedRepos = new Set<string>();
  for (const k of agg.keys()) {
    const [tk, rid] = k.split("|");
    usedTeams.add(tk);
    usedRepos.add(rid);
  }

  const teamMax = Math.max(1, ...[...usedTeams].map((k) => totals.get(k) ?? 0));
  const repoById = new Map(graph.repositories.map((r) => [r.id, r]));
  const repoMax = Math.max(
    1,
    ...[...usedRepos].map((id) => repoById.get(id)?.commits ?? 0),
  );

  const nodes: GraphNode[] = [
    ...[...usedTeams].map((key) => {
      const m = meta.get(key) ?? { name: key, color: UNASSIGNED_COLOR };
      return {
        id: `t:${key}`,
        label: m.name,
        fill: m.color,
        size: 12 + 22 * Math.sqrt((totals.get(key) ?? 0) / teamMax),
        data: { kind: "team" },
      };
    }),
    ...[...usedRepos].map((id) => {
      const r = repoById.get(id);
      return {
        id: `r:${id}`,
        label: r?.name ?? id,
        fill: REPO_COLOR,
        size: 12 + 14 * Math.sqrt((r?.commits ?? 0) / repoMax),
        data: { kind: "repo" },
      };
    }),
  ];

  const edges: GraphEdge[] = [...agg.entries()].map(([k, commits], i) => {
    const [tk, rid] = k.split("|");
    return {
      id: `te${i}`,
      source: `t:${tk}`,
      target: `r:${rid}`,
      label: String(commits),
      size: EDGE_WIDTH,
    };
  });

  return { nodes, edges };
}

/** A labelled switch row for the Display popover. */
function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <span className="flex items-center justify-between gap-4 py-1.5 text-sm">
      {label}
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </span>
  );
}

export function ContributionsGraphTab({ anonymize }: { anonymize: boolean }) {
  const { t } = useTranslation();
  const { data: teams } = useTeamsQuery();
  const [viewMode, setViewMode] = useState<ViewMode>("people");
  const [repoScope, setRepoScope] = useState<RepoScope>("repo");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [showCommitLabels, setShowCommitLabels] = useState(false);
  const [hiddenRepoIds, setHiddenRepoIds] = useState<Set<string>>(new Set());
  const [percentile, setPercentile] = useState(0);
  const [layoutSeed, setLayoutSeed] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // null = follow the smart default (hide the unassigned crowd once any team exists).
  const [showUnassignedOverride, setShowUnassignedOverride] = useState<
    boolean | null
  >(null);

  const { data, isPending, isError } = useContributionsGraphQuery({
    teamId,
    // Fetch per-subpath records so the client can offer both repo and subrepo scopes; scopeRepos()
    // folds them into one star per repo (or breaks them out) below.
    includeSubrepos: true,
    anonymize,
  });
  const graphRef = useRef<GraphCanvasRef | null>(null);

  const showUnassigned =
    showUnassignedOverride ?? (data ? data.teams.length === 0 : true);

  // Resolve repo/subrepo scope (one star per repo, or broken-out subrepos) before building.
  const scoped = useMemo(
    () => (data ? scopeRepos(data, repoScope) : null),
    [data, repoScope],
  );

  const { nodes, edges } = useMemo(() => {
    if (!scoped) return { nodes: [], edges: [] };
    return viewMode === "teams"
      ? buildTeamGraph(scoped, { showUnassigned, hiddenRepoIds })
      : buildPeopleGraph(scoped, {
          showUnassigned,
          hiddenRepoIds,
          percentile,
        });
  }, [scoped, viewMode, showUnassigned, hiddenRepoIds, percentile]);

  // Focus is fully controlled: from the clicked node we mark its edges + neighbours "active";
  // the theme (below) hides every other line and fades the other nodes. Reset when the node set
  // changes so a stale id can't linger after filtering.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset selection when the visible set changes.
  useEffect(() => setSelectedId(null), [nodes]);

  const { selections, actives } = useMemo(() => {
    if (!selectedId || !nodes.some((n) => n.id === selectedId)) {
      return { selections: [] as string[], actives: [] as string[] };
    }
    const nodeIds = new Set<string>([selectedId]);
    const edgeIds: string[] = [];
    for (const e of edges) {
      if (e.source === selectedId || e.target === selectedId) {
        edgeIds.push(e.id);
        nodeIds.add(e.source);
        nodeIds.add(e.target);
      }
    }
    return { selections: [selectedId], actives: [...nodeIds, ...edgeIds] };
  }, [selectedId, nodes, edges]);

  // Reframe to fill the pane whenever the visible set changes, and make zoom snappy. With
  // `animated={false}` the layout snaps to final positions, so the fit frames it tightly.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `nodes` is the intended trigger — refit after the node set (and thus the layout) changes.
  useEffect(() => {
    const id = setTimeout(() => {
      graphRef.current?.fitNodesInView();
      const controls = graphRef.current?.getControls?.() as
        | { dollySpeed?: number; smoothTime?: number }
        | undefined;
      if (controls) {
        controls.dollySpeed = 4; // faster zoom per wheel tick (default 1)
        controls.smoothTime = 0.05; // snappier camera (default 0.25)
      }
    }, 250);
    return () => clearTimeout(id);
  }, [nodes]);

  // Focus theme: while something is selected, non-connected edges vanish and other nodes fade.
  // The selection "ring" halo is hidden (transparent) — a click just highlights the lines.
  const theme = useMemo<Theme>(
    () => ({
      ...lightTheme,
      edge: { ...lightTheme.edge, inactiveOpacity: 0 },
      node: { ...lightTheme.node, inactiveOpacity: 0.12 },
      ring: {
        ...lightTheme.ring,
        fill: "transparent",
        activeFill: "transparent",
      },
    }),
    [],
  );

  const allRepos = scoped?.repositories ?? [];
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
          {/* People / Teams view */}
          <div className="inline-flex rounded-md border border-border p-0.5">
            {(["people", "teams"] as const).map((mode) => (
              <Button
                key={mode}
                type="button"
                size="sm"
                variant={viewMode === mode ? "default" : "ghost"}
                onClick={() => setViewMode(mode)}
              >
                {t(`members.graph.view_${mode}`)}
              </Button>
            ))}
          </div>

          <Select
            value={teamId ?? "all"}
            onValueChange={(v) => setTeamId(!v || v === "all" ? null : v)}
          >
            <SelectTrigger className="w-40">
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
                          <span
                            className={cn(
                              "mr-2 size-3 rounded-sm border",
                              shown
                                ? "border-primary bg-primary"
                                : "border-input",
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
                label={t("members.graph.subrepo_view")}
                checked={repoScope === "subrepo"}
                onChange={(v) => setRepoScope(v ? "subrepo" : "repo")}
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
          {viewMode === "people" ? (
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {percentile > 0
                  ? t("members.graph.percentile_on", { p: percentile })
                  : t("members.graph.percentile_off")}
              </span>
              <Slider
                className="w-32"
                value={percentile}
                min={0}
                max={99}
                step={1}
                onValueChange={(v) =>
                  setPercentile(Array.isArray(v) ? v[0] : v)
                }
              />
            </div>
          ) : null}
          {selections.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedId(null)}
            >
              <XIcon className="size-4" />
              {t("members.graph.clear_selection")}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLayoutSeed((s) => s + 1)}
          >
            <SparklesIcon className="size-4" />
            {t("members.graph.reorganize")}
          </Button>
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
              key={layoutSeed}
              ref={graphRef}
              nodes={nodes}
              edges={edges}
              selections={selections}
              actives={actives}
              onNodeClick={(node) =>
                setSelectedId((prev) => (prev === node.id ? null : node.id))
              }
              onCanvasClick={() => graphRef.current?.fitNodesInView()}
              renderNode={renderGraphNode}
              layoutType="forceDirected2d"
              layoutOverrides={LAYOUT_OVERRIDES}
              sizingType="default"
              // Always show node names (repos + people); "all" adds edge labels too.
              labelType={showCommitLabels ? "all" : "nodes"}
              edgeLabelPosition="natural"
              edgeArrowPosition="none"
              draggable
              // Snap the layout to final positions so the fit frames it tightly (no big margins).
              animated={false}
              theme={theme}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
