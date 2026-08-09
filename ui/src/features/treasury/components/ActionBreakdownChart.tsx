import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import type { KindBreakdownOut } from "@/lib/api";
import { cn } from "@/lib/utils";

const TOP_COUNT = 15;
const ROW_HEIGHT = 30;

type Mode = "tokens" | "cost";

/**
 * Which action eats the tokens: one horizontal bar per job kind, worst first
 * (the backend orders them). Tokens mode stacks the components — cache reads
 * usually dwarf everything, which is exactly the insight — and cost mode shows
 * the actual dollars per kind.
 */
export function ActionBreakdownChart({ rows }: { rows: KindBreakdownOut[] }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("tokens");
  const [showAll, setShowAll] = useState(false);

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        {t("treasury.breakdown.empty")}
      </p>
    );
  }

  const data = rows.map((row) => ({
    ...row,
    label: t(`treasury.kinds.${row.kind}`, { defaultValue: row.kind }),
  }));
  const visible = showAll ? data : data.slice(0, TOP_COUNT);
  const height = visible.length * ROW_HEIGHT + 60;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {(["tokens", "cost"] as const).map((option) => (
          <Button
            key={option}
            variant="ghost"
            size="sm"
            onClick={() => setMode(option)}
            className={cn(
              "text-xs",
              mode === option
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground",
            )}
          >
            {t(`treasury.breakdown.mode_${option}`)}
          </Button>
        ))}
      </div>

      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={visible}
            layout="vertical"
            margin={{ top: 4, right: 12, left: 8, bottom: 0 }}
            barCategoryGap="25%"
          >
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={false}
              stroke="var(--border)"
            />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) =>
                mode === "cost"
                  ? `$${value}`
                  : Intl.NumberFormat("en", { notation: "compact" }).format(
                      value,
                    )
              }
            />
            <YAxis
              type="category"
              dataKey="label"
              width={190}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.4 }}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                fontSize: 12,
                color: "var(--popover-foreground)",
              }}
              formatter={(value, name) => [
                mode === "cost"
                  ? `$${Number(value).toFixed(4)}`
                  : Number(value).toLocaleString(),
                name,
              ]}
            />
            {mode === "tokens" ? (
              <>
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  iconType="circle"
                  iconSize={8}
                />
                <Bar
                  dataKey="input_tokens"
                  name={t("treasury.breakdown.input")}
                  stackId="tokens"
                  fill="var(--chart-1)"
                />
                <Bar
                  dataKey="output_tokens"
                  name={t("treasury.breakdown.output")}
                  stackId="tokens"
                  fill="var(--chart-5)"
                />
                <Bar
                  dataKey="cache_read_tokens"
                  name={t("treasury.breakdown.cache_read")}
                  stackId="tokens"
                  fill="var(--muted-foreground)"
                  opacity={0.5}
                />
                <Bar
                  dataKey="cache_creation_tokens"
                  name={t("treasury.breakdown.cache_write")}
                  stackId="tokens"
                  fill="var(--chart-3)"
                  radius={[0, 3, 3, 0]}
                />
              </>
            ) : (
              <Bar
                dataKey="cost_usd"
                name={t("treasury.breakdown.cost")}
                fill="var(--chart-2)"
                radius={[0, 3, 3, 0]}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {data.length > TOP_COUNT ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll
            ? t("treasury.breakdown.show_less", { count: TOP_COUNT })
            : t("treasury.breakdown.show_all", { count: data.length })}
        </Button>
      ) : null}
    </div>
  );
}
