import { MaximizeIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  GraphCanvas,
  type GraphCanvasRef,
  type GraphEdge,
  type GraphNode,
  lightTheme,
} from "reagraph";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTeamsQuery } from "@/features/teams/api";
import type { ContributionsGraphOut } from "@/lib/api";
import { useContributionsGraphQuery } from "../api";

const UNASSIGNED_COLOR = "#94a3b8"; // slate-400
const REPO_COLOR = "#475569"; // slate-600
const REPO_CLUSTER = "Repositories";

/** Turn the graph payload into reagraph nodes/edges. Members cluster by team (reagraph draws a
 * labelled bubble per `data.cluster`), repos form their own cluster; edges are sized by commits.
 * Unassigned members are dropped unless `showUnassigned`. */
function buildGraph(
  graph: ContributionsGraphOut,
  showUnassigned: boolean,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const members = graph.members.filter((m) => showUnassigned || m.team);
  const memberIds = new Set(members.map((m) => m.id));
  const rawEdges = graph.edges.filter((e) => memberIds.has(e.member_id));
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
      data: { cluster: m.team?.name ?? "Unassigned" },
    })),
    ...repos.map((r) => ({
      id: `r:${r.id}`,
      label: r.name,
      fill: REPO_COLOR,
      size: 10 + 14 * Math.sqrt(r.commits / repoMax),
      data: { cluster: REPO_CLUSTER },
    })),
  ];

  const edges: GraphEdge[] = rawEdges.map((e, i) => ({
    id: `e${i}`,
    source: `m:${e.member_id}`,
    target: `r:${e.repository_id}`,
    size: 1 + 4 * (e.commits / edgeMax),
    fill: colorOf.get(e.member_id) ?? UNASSIGNED_COLOR,
  }));

  return { nodes, edges };
}

export function ContributionsGraphTab({ anonymize }: { anonymize: boolean }) {
  const { t } = useTranslation();
  const { data: teams } = useTeamsQuery();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [includeSubrepos, setIncludeSubrepos] = useState(true);
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
    () => (data ? buildGraph(data, showUnassigned) : { nodes: [], edges: [] }),
    [data, showUnassigned],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={teamId ?? "all"}
            onValueChange={(v) => setTeamId(!v || v === "all" ? null : v)}
          >
            <SelectTrigger className="w-52">
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
          <span className="flex items-center gap-2 text-sm">
            <Switch
              checked={showUnassigned}
              onCheckedChange={setShowUnassignedOverride}
              aria-label={t("members.graph.show_unassigned")}
            />
            {t("members.graph.show_unassigned")}
          </span>
          <span className="flex items-center gap-2 text-sm">
            <Switch
              checked={includeSubrepos}
              onCheckedChange={setIncludeSubrepos}
              aria-label={t("members.graph.include_subrepos")}
            />
            {t("members.graph.include_subrepos")}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data && data.teams.length > 0
            ? data.teams.map((team) => (
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
              ))
            : null}
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

      <Card className="h-[620px] overflow-hidden p-0">
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
              clusterAttribute="cluster"
              layoutType="forceDirected2d"
              sizingType="default"
              labelType="auto"
              edgeArrowPosition="none"
              draggable
              theme={lightTheme}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
