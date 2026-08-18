import { UsersIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ManageTeamsDialog } from "@/features/teams";
import { useTeamContributionsQuery } from "../api";

const CHART_TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  fontSize: 12,
  color: "var(--popover-foreground)",
} as const;

const UNASSIGNED_COLOR = "#94a3b8";

export function TeamsDashboardTab() {
  const { t } = useTranslation();
  const { data, isPending, isError, error } = useTeamContributionsQuery();
  const [manageOpen, setManageOpen] = useState(false);

  const rows = (data?.teams ?? []).map((row) => ({
    name: row.team?.name ?? t("members.teams.unassigned"),
    color: row.team?.color ?? UNASSIGNED_COLOR,
    commits: row.total_commits,
    members: row.member_count,
    repositories: row.repository_count,
    share: row.share,
    isUnassigned: row.team === null,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t("members.teams.subtitle")}
        </p>
        <Button variant="outline" size="sm" onClick={() => setManageOpen(true)}>
          <UsersIcon className="size-4" />
          {t("members.teams.manage")}
        </Button>
      </div>

      {isError ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {t("common.states.api_unreachable", {
            message: error
              ? String((error as { detail?: string }).detail ?? "")
              : "",
          })}
        </Card>
      ) : isPending ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {t("members.teams.loading")}
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          {t("members.teams.empty")}
        </Card>
      ) : (
        <>
          <Card className="h-72 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rows}
                margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                  formatter={(value) => [
                    value as number,
                    t("members.teams.col_commits"),
                  ]}
                />
                <Bar dataKey="commits" radius={[4, 4, 0, 0]}>
                  {rows.map((row) => (
                    <Cell key={row.name} fill={row.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">
                    {t("members.teams.col_team")}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {t("members.teams.col_members")}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {t("members.teams.col_repositories")}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {t("members.teams.col_commits")}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {t("members.teams.col_share")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name} className="border-t border-border">
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <span
                          className="size-3 rounded-full"
                          style={{ backgroundColor: row.color }}
                        />
                        <span
                          className={
                            row.isUnassigned ? "text-muted-foreground" : ""
                          }
                        >
                          {row.name}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{row.members}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {row.repositories}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{row.commits}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {Math.round(row.share * 100)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <ManageTeamsDialog open={manageOpen} onOpenChange={setManageOpen} />
    </div>
  );
}
