import { BrainCircuitIcon, Loader2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Markdown } from "@/components/shared/Markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PromptReviewOut } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isArtefactActive, useRequestReviewMutation } from "../api";
import { REVIEW_DIMENSIONS, scoreFor } from "../reviews";
import { scoreVariant } from "./ScoreBadge";

/** A 0-100 bar. `inverted` flips the colour scale for hallucination risk, where high is bad. */
function ScoreBar({
  label,
  value,
  inverted,
}: {
  label: string;
  value: number | null;
  inverted: boolean;
}) {
  const { t } = useTranslation();
  if (value === null) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm text-muted-foreground">
          {t("prompts.review.not_scored")}
        </span>
      </div>
    );
  }
  // The bar always shows the raw score; only the colour knows which direction is good.
  const variant = scoreVariant(inverted ? 100 - value : value);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-medium tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            variant === "success" && "bg-success",
            variant === "warning" && "bg-warning",
            variant === "destructive" && "bg-destructive",
          )}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

/**
 * The model's judgement of a prompt, kept deliberately separate from the deterministic checks.
 *
 * These numbers are one model's opinion on one run: they vary, and the model that produced them is
 * shown next to them for that reason. The mechanical checks above are facts about the text. Blurring
 * the two would be the easiest way to make this module lie.
 */
export function ReviewPanel({
  promptId,
  versionId,
  reviews,
}: {
  promptId: string;
  versionId: string;
  reviews: PromptReviewOut[];
}) {
  const { t } = useTranslation();
  const { mutate: requestReview, isPending } = useRequestReviewMutation(
    promptId,
    versionId,
  );

  const latest = reviews[0];
  const running = latest !== undefined && isArtefactActive(latest.status);

  const askForReview = () =>
    requestReview(undefined, {
      onSuccess: () => toast.success(t("prompts.review.requested")),
    });

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <BrainCircuitIcon className="size-4 text-muted-foreground" />
          <span className="font-semibold">{t("prompts.review.title")}</span>
          {latest?.status === "done" ? (
            <Badge variant="outline">{latest.model}</Badge>
          ) : null}
          {latest?.finished_at ? (
            <span className="text-xs text-muted-foreground">
              {formatDateTime(latest.finished_at)}
            </span>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={askForReview}
            disabled={isPending || running}
          >
            {isPending || running ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <BrainCircuitIcon />
            )}
            {latest ? t("prompts.review.rerun") : t("prompts.review.run")}
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          {t("prompts.review.caveat")}
        </p>

        {running ? (
          <p className="text-sm text-muted-foreground">
            {t("prompts.review.running", { model: latest.model })}
          </p>
        ) : latest?.status === "failed" ? (
          <p className="text-sm text-destructive">
            {latest.error ?? t("prompts.review.failed")}
          </p>
        ) : latest?.status === "done" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {REVIEW_DIMENSIONS.map((dimension) => (
                <ScoreBar
                  key={dimension.key}
                  label={t(`prompts.review.dimension.${dimension.key}`)}
                  value={scoreFor(latest, dimension.key)}
                  inverted={dimension.inverted}
                />
              ))}
            </div>

            {latest.summary ? <Markdown>{latest.summary}</Markdown> : null}

            {latest.findings.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {latest.findings.map((finding) => (
                  <li key={finding.title} className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {finding.title}
                      <Badge
                        variant={
                          finding.severity === "high"
                            ? "destructive"
                            : finding.severity === "medium"
                              ? "warning"
                              : "secondary"
                        }
                      >
                        {t(`prompts.review.severity.${finding.severity}`)}
                      </Badge>
                      <Badge variant="outline">
                        {t(`prompts.review.dimension.${finding.dimension}`)}
                      </Badge>
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {finding.detail}
                    </span>
                    {finding.evidence ? (
                      <code className="w-fit max-w-full truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {finding.evidence}
                      </code>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("prompts.review.empty")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
