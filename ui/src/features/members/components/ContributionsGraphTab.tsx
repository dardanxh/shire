import {
  Background,
  Controls,
  type Edge,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useStore,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from "d3-force";
import { polygonHull } from "d3-polygon";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
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

const UNASSIGNED = "__unassigned__";
const UNASSIGNED_COLOR = "#94a3b8"; // slate-400

interface MemberNodeData extends Record<string, unknown> {
  label: string;
  commits: number;
  color: string;
  radius: number;
}
interface RepoNodeData extends Record<string, unknown> {
  label: string;
  commits: number;
}

/** A person: a color-filled dot sized by commit volume, tinted by their team. */
function MemberNode({ data }: NodeProps<Node<MemberNodeData>>) {
  const r = data.radius;
  return (
    <div title={`${data.label} · ${data.commits}`} className="group">
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      <div
        className="rounded-full border-2 border-background shadow-sm"
        style={{ width: r * 2, height: r * 2, backgroundColor: data.color }}
      />
      <span className="pointer-events-none absolute left-1/2 top-full mt-0.5 hidden -translate-x-1/2 whitespace-nowrap rounded bg-popover px-1 text-[10px] text-popover-foreground shadow group-hover:block">
        {data.label}
      </span>
    </div>
  );
}

/** A repository: a labelled card, the target of member edges. */
function RepoNode({ data }: NodeProps<Node<RepoNodeData>>) {
  return (
    <div
      title={`${data.label} · ${data.commits}`}
      className="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium shadow-sm"
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      {data.label}
    </div>
  );
}

const nodeTypes = { member: MemberNode, repo: RepoNode };

interface SimNode {
  id: string;
  kind: "member" | "repo";
  teamId: string;
  color: string;
  label: string;
  commits: number;
  radius: number;
  x?: number;
  y?: number;
}

interface Hull {
  teamId: string;
  color: string;
  points: [number, number][];
}

/** Run a one-off d3-force layout: members cluster toward per-team anchors, repos float on
 * their edges in between. Returns React Flow nodes/edges plus each team's member positions
 * (for the dotted hull). */
function computeLayout(graph: ContributionsGraphOut) {
  const memberTeam = new Map<string, { id: string; color: string }>();
  for (const m of graph.members) {
    memberTeam.set(m.id, {
      id: m.team?.id ?? UNASSIGNED,
      color: m.team?.color ?? UNASSIGNED_COLOR,
    });
  }

  // A stable anchor per team on a circle, so teams settle in distinct regions.
  const teamIds = Array.from(
    new Set(graph.members.map((m) => m.team?.id ?? UNASSIGNED)),
  );
  const anchors = new Map<string, { x: number; y: number }>();
  const spread = 220 + teamIds.length * 40;
  teamIds.forEach((tid, i) => {
    const angle = (i / Math.max(1, teamIds.length)) * Math.PI * 2;
    anchors.set(tid, {
      x: Math.cos(angle) * spread,
      y: Math.sin(angle) * spread,
    });
  });

  const commitsArr = graph.edges.map((e) => e.commits);
  const maxCommits = Math.max(1, ...commitsArr);
  const memberCommits = graph.members.map((m) => m.commits);
  const maxMemberCommits = Math.max(1, ...memberCommits);

  const nodes: SimNode[] = [
    ...graph.members.map((m): SimNode => {
      const team = memberTeam.get(m.id) ?? {
        id: UNASSIGNED,
        color: UNASSIGNED_COLOR,
      };
      return {
        id: `m:${m.id}`,
        kind: "member",
        teamId: team.id,
        color: team.color,
        label: m.name,
        commits: m.commits,
        radius: 6 + 14 * Math.sqrt(m.commits / maxMemberCommits),
      };
    }),
    ...graph.repositories.map(
      (r): SimNode => ({
        id: `r:${r.id}`,
        kind: "repo",
        teamId: UNASSIGNED,
        color: "#e2e8f0",
        label: r.name,
        commits: r.commits,
        radius: 20,
      }),
    ),
  ];

  const links = graph.edges.map((e) => ({
    source: `m:${e.member_id}`,
    target: `r:${e.repository_id}`,
    value: e.commits,
  }));

  const sim = forceSimulation<SimNode>(nodes)
    .force(
      "link",
      forceLink<SimNode, (typeof links)[number]>(links)
        .id((d) => d.id)
        .distance(70)
        .strength(0.15),
    )
    .force("charge", forceManyBody().strength(-140))
    .force(
      "collide",
      forceCollide<SimNode>((d) => d.radius + 6),
    )
    .force(
      "x",
      forceX<SimNode>((d) => anchors.get(d.teamId)?.x ?? 0).strength((d) =>
        d.kind === "member" ? 0.09 : 0.01,
      ),
    )
    .force(
      "y",
      forceY<SimNode>((d) => anchors.get(d.teamId)?.y ?? 0).strength((d) =>
        d.kind === "member" ? 0.09 : 0.01,
      ),
    )
    .stop();
  for (let i = 0; i < 320; i++) sim.tick();

  const rfNodes: Node[] = nodes.map((n) => ({
    id: n.id,
    type: n.kind,
    position: { x: n.x ?? 0, y: n.y ?? 0 },
    data:
      n.kind === "member"
        ? ({
            label: n.label,
            commits: n.commits,
            color: n.color,
            radius: n.radius,
          } satisfies MemberNodeData)
        : ({ label: n.label, commits: n.commits } satisfies RepoNodeData),
    draggable: true,
  }));

  const rfEdges: Edge[] = graph.edges.map((e, i) => {
    const width = 1 + 6 * (e.commits / maxCommits);
    const color = memberTeam.get(e.member_id)?.color ?? UNASSIGNED_COLOR;
    return {
      id: `e${i}`,
      source: `m:${e.member_id}`,
      target: `r:${e.repository_id}`,
      type: "straight",
      style: { strokeWidth: width, stroke: color, opacity: 0.35 },
    };
  });

  // Group final member positions per team for the dotted hulls.
  const byTeam = new Map<string, { color: string; pts: [number, number][] }>();
  for (const n of nodes) {
    if (n.kind !== "member") continue;
    const bucket = byTeam.get(n.teamId) ?? { color: n.color, pts: [] };
    bucket.pts.push([n.x ?? 0, n.y ?? 0]);
    byTeam.set(n.teamId, bucket);
  }
  const hulls: Hull[] = [];
  for (const [teamId, { color, pts }] of byTeam) {
    if (teamId === UNASSIGNED) continue; // don't ring the "no team" crowd
    hulls.push({ teamId, color, points: padHull(pts) });
  }

  return { rfNodes, rfEdges, hulls };
}

/** Expand a team's point cloud into a padded outline. ≥3 points → convex hull grown outward
 * from its centroid; 1–2 points → a padded box so a small team still gets a border. */
function padHull(pts: [number, number][]): [number, number][] {
  const PAD = 34;
  if (pts.length === 0) return [];
  if (pts.length < 3) {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs) - PAD;
    const maxX = Math.max(...xs) + PAD;
    const minY = Math.min(...ys) - PAD;
    const maxY = Math.max(...ys) + PAD;
    return [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
    ];
  }
  const hull = polygonHull(pts) ?? pts;
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length;
  return hull.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return [x + (dx / len) * PAD, y + (dy / len) * PAD];
  });
}

function hullPath(points: [number, number][]): string {
  if (points.length === 0) return "";
  return `${points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ")} Z`;
}

/** Dotted team outlines, drawn in flow coordinates and kept in sync with pan/zoom. */
function TeamHulls({ hulls }: { hulls: Hull[] }) {
  const [tx, ty, zoom] = useStore((s) => s.transform);
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ zIndex: 0 }}
    >
      <g transform={`translate(${tx},${ty}) scale(${zoom})`}>
        {hulls.map((h) => (
          <path
            key={h.teamId}
            d={hullPath(h.points)}
            fill={h.color}
            fillOpacity={0.06}
            stroke={h.color}
            strokeWidth={2}
            strokeDasharray="6 5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    </svg>
  );
}

export function ContributionsGraphTab({ anonymize }: { anonymize: boolean }) {
  const { t } = useTranslation();
  const { data: teams } = useTeamsQuery();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [includeSubrepos, setIncludeSubrepos] = useState(true);
  const { data, isPending, isError } = useContributionsGraphQuery({
    teamId,
    includeSubrepos,
    anonymize,
  });

  const layout = useMemo(() => (data ? computeLayout(data) : null), [data]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={teamId ?? "all"}
            onValueChange={(v) => setTeamId(v === "all" ? null : v)}
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
              checked={includeSubrepos}
              onCheckedChange={setIncludeSubrepos}
              aria-label={t("members.graph.include_subrepos")}
            />
            {t("members.graph.include_subrepos")}
          </span>
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
      </div>

      <Card className="h-[620px] overflow-hidden p-0">
        {isError ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("common.states.api_unreachable", { message: "" })}
          </div>
        ) : isPending || !layout ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("members.graph.loading")}
          </div>
        ) : layout.rfNodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("members.graph.empty")}
          </div>
        ) : (
          <ReactFlowProvider>
            <ReactFlow
              nodes={layout.rfNodes}
              edges={layout.rfEdges}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.1}
              proOptions={{ hideAttribution: true }}
              nodesConnectable={false}
              edgesFocusable={false}
            >
              <TeamHulls hulls={layout.hulls} />
              <Background />
              <Controls showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
        )}
      </Card>
    </div>
  );
}
