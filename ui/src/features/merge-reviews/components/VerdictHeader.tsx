import { TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { MergeReviewDetailOut, RiskBreakdownOut } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SectionShell } from "./SectionShell";
import { SizeClassBadge } from "./SizeClassBadge";
import { VerdictBadge } from "./VerdictBadge";

const VERDICT_TEXT: Record<string, string> = {
  looks_safe: "text-[var(--success)]",
  needs_attention: "text-[var(--warning)]",
  high_risk: "text-destructive",
};

/**
 * Layer 1 — judge the MR in three seconds. The footprint-derived right column
 * paints instantly; the gauge + factor bars fill in when the risk section lands.
 */
export function VerdictHeader({ review }: { review: MergeReviewDetailOut }) {
  const { t } = useTranslation();
  const footprint = review.footprint;

  return (
    <Card>
      <CardContent className="grid gap-6 md:grid-cols-[auto_1fr_auto]">
        <SectionShell
          status={review.risk_status}
          skeleton={<Skeleton className="size-28 rounded-full" />}
        >
          <RiskGauge
            score={review.risk_score ?? 0}
            verdict={review.risk_verdict}
          />
        </SectionShell>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <VerdictBadge
              verdict={review.risk_verdict}
              className="px-3 py-1 text-sm"
            />
            <span className="text-xs text-muted-foreground">
              {t("merge_reviews.verdict.score_label")}
            </span>
          </div>
          {review.risk_breakdown ? (
            <RiskFactors breakdown={review.risk_breakdown} />
          ) : null}
        </div>

        <div className="space-y-2 md:text-right">
          <SizeClassBadge
            size={footprint?.size}
            className="px-3 py-1 text-sm"
          />
          {footprint ? (
            <p className="text-xs tabular-nums text-muted-foreground">
              {t("merge_reviews.size.facts", {
                files: footprint.files_changed,
                additions: footprint.total_additions,
                deletions: footprint.total_deletions,
                commits: footprint.commit_count,
              })}
            </p>
          ) : null}
          {footprint && !footprint.efficient ? (
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--warning)]">
              <TriangleAlertIcon className="size-3.5" />
              {t("merge_reviews.size.inefficient")}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function RiskGauge({
  score,
  verdict,
}: {
  score: number;
  verdict: string | null | undefined;
}) {
  return (
    <div
      className={cn(
        "relative size-28",
        VERDICT_TEXT[verdict ?? ""] ?? "text-muted-foreground",
      )}
    >
      <RadialBarChart
        width={112}
        height={112}
        cx="50%"
        cy="50%"
        innerRadius="76%"
        outerRadius="100%"
        barSize={9}
        data={[{ value: score }]}
        startAngle={90}
        endAngle={-270}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
        <RadialBar
          dataKey="value"
          cornerRadius={5}
          fill="currentColor"
          background={{ fill: "var(--muted)" }}
          isAnimationActive={false}
        />
      </RadialBarChart>
      <div className="absolute inset-0 grid place-items-center">
        <span className="text-2xl font-semibold tabular-nums">{score}</span>
      </div>
    </div>
  );
}

function RiskFactors({ breakdown }: { breakdown: RiskBreakdownOut }) {
  const { t } = useTranslation();
  const factors: Array<{ key: string; label: string; value: number | null }> = [
    {
      key: "size",
      label: t("merge_reviews.verdict.factor_size"),
      value: breakdown.size_score,
    },
    {
      key: "hotspot",
      label: t("merge_reviews.verdict.factor_hotspot"),
      value: breakdown.hotspot_score,
    },
    {
      key: "test",
      label: t("merge_reviews.verdict.factor_test"),
      value: breakdown.test_score,
    },
    {
      key: "findings",
      label:
        breakdown.findings_score == null
          ? t("merge_reviews.verdict.factor_findings_none")
          : t("merge_reviews.verdict.factor_findings"),
      value: breakdown.findings_score ?? null,
    },
  ];

  return (
    <dl className="space-y-1.5">
      {factors.map((factor) => (
        <div key={factor.key} className="flex items-center gap-3">
          <dt className="w-32 shrink-0 truncate text-xs text-muted-foreground">
            {factor.label}
          </dt>
          <dd className="flex min-w-0 flex-1 items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              {factor.value != null ? (
                <div
                  className="h-full rounded-full bg-foreground/50"
                  style={{ width: `${factor.value}%` }}
                />
              ) : null}
            </div>
            <span className="w-7 text-right text-xs tabular-nums text-muted-foreground">
              {factor.value ?? "—"}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
