import { useTranslation } from "react-i18next";

import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { PromptAnalysisOut, PromptReviewOut } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { FindingsList } from "./FindingsList";
import { ReviewPanel } from "./ReviewPanel";
import { ScoreBadge } from "./ScoreBadge";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

/**
 * The deterministic verdict on whatever is currently in the editor.
 *
 * Kept visually separate from the AI-judged scores that arrive in a later phase: these checks are
 * mechanical facts about the text, and a reader must never mistake a model's opinion for one.
 */
export function ChecksPanel({
  analysis,
  isPending,
  promptId,
  versionId,
  reviews,
}: {
  analysis: PromptAnalysisOut | undefined;
  isPending: boolean;
  promptId: string;
  /** Absent until the prompt has a saved version — the AI review scores a *saved* body. */
  versionId: string | undefined;
  reviews: PromptReviewOut[];
}) {
  const { t } = useTranslation();

  if (isPending && !analysis) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {t("prompts.checks.empty")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-4 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t("prompts.checks.score")}
            </span>
            <ScoreBadge score={analysis.score} />
          </div>
          <Stat
            label={t("prompts.checks.tokens")}
            value={formatNumber(analysis.estimated_input_tokens)}
          />
          <Stat
            label={t("prompts.checks.size")}
            value={t(`prompts.checks.size_verdict.${analysis.size_verdict}`)}
          />
          <Stat
            label={t("prompts.checks.goals")}
            value={formatNumber(analysis.goal_count)}
          />
          <Stat
            label={t("prompts.checks.words")}
            value={formatNumber(analysis.stats.words)}
          />
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        {t("prompts.checks.scoring_note")}
      </p>

      <FindingsList findings={analysis.findings} />

      {/* The line between fact and opinion. Everything above is mechanical; everything below is one
          model's judgement on one run. Keeping them in separate blocks with the caveat between is
          the whole reason the module can be trusted. */}
      {versionId ? (
        <>
          <Separator />
          <ReviewPanel
            promptId={promptId}
            versionId={versionId}
            reviews={reviews}
          />
        </>
      ) : null}
    </div>
  );
}
