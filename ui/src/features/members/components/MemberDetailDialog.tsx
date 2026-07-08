import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemberDetailQuery } from "../api";

interface Props {
  id: string | null;
  anonymize: boolean;
  onClose: () => void;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function MemberDetailDialog({ id, anonymize, onClose }: Props) {
  const { t } = useTranslation();
  const { data, isPending } = useMemberDetailQuery(id ?? "", anonymize);

  const chartData =
    data?.repositories.map((r) => ({
      // Only the last path segment keeps the axis readable.
      label: r.repository_name.split("/").pop() ?? r.repository_name,
      commits: r.commits,
    })) ?? [];

  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{data?.name ?? t("members.detail.title")}</DialogTitle>
          <DialogDescription>{data?.email ?? ""}</DialogDescription>
        </DialogHeader>

        {isPending || !data ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label={t("members.detail.commits")}
                value={String(data.commits)}
              />
              <Stat
                label={t("members.detail.lines_added")}
                value={`+${data.lines_added}`}
              />
              <Stat
                label={t("members.detail.lines_removed")}
                value={`−${data.lines_removed}`}
              />
              <Stat
                label={t("members.detail.files")}
                value={String(data.files_touched)}
              />
            </div>

            {chartData.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-medium">
                  {t("members.detail.commits_by_repository")}
                </p>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="var(--border)"
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={false}
                        interval={0}
                      />
                      <YAxis
                        allowDecimals={false}
                        width={36}
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: "var(--muted)" }}
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius)",
                          fontSize: 12,
                          color: "var(--popover-foreground)",
                        }}
                      />
                      <Bar
                        dataKey="commits"
                        fill="var(--chart-3)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-sm font-medium">
                {t("members.detail.by_repository")}
              </p>
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">
                        {t("members.detail.col_repository")}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {t("members.detail.col_commits")}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {t("members.detail.col_churn")}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {t("members.detail.col_files")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.repositories.map((r) => (
                      <tr
                        key={r.repository_id}
                        className="border-t border-border"
                      >
                        <td className="px-3 py-2 font-medium">
                          {r.repository_name}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.commits}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                          <span className="text-emerald-600 dark:text-emerald-400">
                            +{r.lines_added}
                          </span>{" "}
                          <span className="text-red-600 dark:text-red-400">
                            −{r.lines_removed}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.files_touched}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
