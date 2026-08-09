import { Link } from "@tanstack/react-router";
import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Markdown } from "@/components/shared/Markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  MergeReviewDetailOut,
  MrCommentOut,
  MrHobitReviewOut,
  MrRemarkOut,
} from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRerunHobitReviewMutation } from "../api";
import { RemarkStarButton } from "./RemarkStarButton";
import { ReviewSeverityBadge } from "./ReviewSeverityBadge";

const RUNNING = new Set(["pending", "running"]);

/** The kept-remarks index: what was starred, by the id of what was starred. */
function remarksByRef(review: MergeReviewDetailOut): Map<string, MrRemarkOut> {
  return new Map(review.remarks.map((r) => [r.source_ref, r]));
}

/**
 * Layer 5 — the hobits' verdicts. Top findings first (aggregated across all
 * completed reviews, worst severity up), then one card per hobit. Completed
 * cards render while slower reviews still show their skeleton — the effect
 * comes entirely from the polling detail query re-rendering this list.
 */
export function HobitReviewsSection({
  review,
}: {
  review: MergeReviewDetailOut;
}) {
  const { t } = useTranslation();
  if (review.hobit_reviews.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        {t("merge_reviews.reviews.none_selected")}
      </p>
    );
  }

  const runningCount = review.hobit_reviews.filter((r) =>
    RUNNING.has(r.status),
  ).length;
  const anyCompleted = review.hobit_reviews.some(
    (r) => r.status === "completed",
  );
  const remarks = remarksByRef(review);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("merge_reviews.reviews.title")}
        </h2>
        {runningCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2Icon className="size-3 animate-spin" />
            {t("merge_reviews.reviews.running_count", { count: runningCount })}
          </span>
        ) : null}
      </div>

      {anyCompleted ? (
        <TopFindingsPanel review={review} remarks={remarks} />
      ) : null}

      <div className="space-y-3">
        {review.hobit_reviews.map((hobitReview) => (
          <HobitReviewCard
            key={hobitReview.hobit_slug}
            reviewId={review.id}
            review={hobitReview}
            remarks={remarks}
          />
        ))}
      </div>
    </div>
  );
}

function TopFindingsPanel({
  review,
  remarks,
}: {
  review: MergeReviewDetailOut;
  remarks: Map<string, MrRemarkOut>;
}) {
  const { t } = useTranslation();

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="text-base">
          {t("merge_reviews.reviews.top_title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {review.top_findings.length === 0 ? (
          <p className="text-sm text-[var(--success)]">
            {t("merge_reviews.reviews.top_empty")}
          </p>
        ) : (
          <ul className="space-y-3">
            {review.top_findings.map((finding) => (
              <li
                key={
                  finding.comment_id ||
                  `${finding.hobit_slug}-${finding.body.slice(0, 24)}`
                }
                className="flex items-start gap-3"
              >
                <ReviewSeverityBadge
                  severity={finding.severity}
                  className="mt-0.5 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  {/* Two-line preview of a Markdown body: paragraphs go inline so the
                      line clamp still applies to it as one block of text. */}
                  <Markdown className="line-clamp-2 [&_p]:inline">
                    {finding.body}
                  </Markdown>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {finding.file ? (
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {finding.file}
                        {finding.line != null ? `:${finding.line}` : ""}
                      </span>
                    ) : null}
                    <Badge variant="outline" className="text-xs">
                      {finding.hobit_name}
                    </Badge>
                  </div>
                </div>
                {finding.comment_id ? (
                  <RemarkStarButton
                    reviewId={review.id}
                    remark={remarks.get(finding.comment_id)}
                    payload={{
                      source_kind: "hobit",
                      source_ref: finding.comment_id,
                      source_label: finding.hobit_name,
                      severity: finding.severity,
                      file: finding.file,
                      line: finding.line,
                      text: finding.body,
                    }}
                    className="mt-0.5"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function HobitReviewCard({
  reviewId,
  review,
  remarks,
}: {
  reviewId: string;
  review: MrHobitReviewOut;
  remarks: Map<string, MrRemarkOut>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const isRunning = RUNNING.has(review.status);
  const { mutate: rerun, isPending: isQueueingRerun } =
    useRerunHobitReviewMutation(reviewId);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            {/* The title is the way into the hobit itself — e.g. to raise its timeout
                after a timed-out run, then come back and re-run. */}
            <Link
              to="/hobits/$slug"
              params={{ slug: review.hobit_slug }}
              className="inline-flex items-center gap-1.5 hover:text-primary hover:underline"
            >
              {review.hobit_name}
              <ArrowUpRightIcon className="size-3.5 text-muted-foreground" />
            </Link>
          </CardTitle>
          <div className="flex items-center gap-2">
            {isRunning ? (
              <Badge variant="secondary" className="animate-pulse">
                {review.status === "running"
                  ? t("merge_reviews.reviews.reviewing")
                  : t("merge_reviews.reviews.queued")}
              </Badge>
            ) : review.status !== "completed" ? (
              <Badge variant="outline" className="text-destructive">
                {t(
                  `merge_reviews.reviews.${
                    review.status === "parse_failed"
                      ? "parse_failed"
                      : review.status === "timeout"
                        ? "timeout"
                        : review.status === "agent_unavailable"
                          ? "agent_unavailable"
                          : "failed"
                  }`,
                )}
              </Badge>
            ) : review.self_score != null ? (
              <span className="text-xs tabular-nums text-muted-foreground">
                {review.self_score}/100
              </span>
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={isRunning || isQueueingRerun}
              onClick={() =>
                rerun(review.hobit_slug, {
                  onSuccess: () =>
                    toast.success(
                      t("merge_reviews.reviews.rerun_queued", {
                        name: review.hobit_name,
                      }),
                    ),
                })
              }
              aria-label={t("merge_reviews.reviews.rerun", {
                name: review.hobit_name,
              })}
            >
              <RefreshCwIcon
                className={cn(
                  "size-3.5",
                  (isRunning || isQueueingRerun) && "animate-spin",
                )}
              />
            </Button>
          </div>
        </div>
        <p className="text-xs tabular-nums text-muted-foreground">
          {isRunning && review.started_at
            ? t("merge_reviews.reviews.started_at", {
                when: formatDateTime(review.started_at),
              })
            : review.finished_at
              ? t("merge_reviews.reviews.last_run", {
                  when: formatDateTime(review.finished_at),
                })
              : t("merge_reviews.reviews.never_run")}
        </p>
        {review.status === "completed" && review.headline ? (
          <p className="text-sm font-medium">{review.headline}</p>
        ) : null}
      </CardHeader>
      <CardContent>
        {isRunning ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : review.status === "completed" ? (
          review.comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("merge_reviews.reviews.no_comments")}
            </p>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <ChevronDownIcon
                  className={cn(
                    "size-3.5 transition-transform",
                    !open && "-rotate-90",
                  )}
                />
                {t("merge_reviews.reviews.comments_count", {
                  count: review.comments.length,
                })}
              </button>
              {open ? (
                <ul className="space-y-3">
                  {review.comments.map((comment) => (
                    <ReviewCommentRow
                      key={comment.id || comment.body.slice(0, 32)}
                      reviewId={reviewId}
                      hobitName={review.hobit_name}
                      comment={comment}
                      remarks={remarks}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          )
        ) : review.error ? (
          <p className="text-xs text-muted-foreground">{review.error}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ReviewCommentRow({
  reviewId,
  hobitName,
  comment,
  remarks,
}: {
  reviewId: string;
  hobitName: string;
  comment: MrCommentOut;
  remarks: Map<string, MrRemarkOut>;
}) {
  return (
    <li className="flex items-start gap-3 rounded-md border border-border p-3">
      <ReviewSeverityBadge
        severity={comment.severity}
        className="mt-0.5 shrink-0"
      />
      <div className="min-w-0 flex-1 space-y-1">
        {comment.file ? (
          <p className="truncate font-mono text-xs text-muted-foreground">
            {comment.file}
            {comment.line != null ? `:${comment.line}` : ""}
          </p>
        ) : null}
        {/* Comment bodies are Markdown too — the hobit prompt asks for it explicitly. */}
        <Markdown>{comment.body}</Markdown>
      </div>
      {comment.id ? (
        <RemarkStarButton
          reviewId={reviewId}
          remark={remarks.get(comment.id)}
          payload={{
            source_kind: "hobit",
            source_ref: comment.id,
            source_label: hobitName,
            severity: comment.severity,
            file: comment.file,
            line: comment.line,
            text: comment.body,
          }}
          className="mt-0.5"
        />
      ) : null}
    </li>
  );
}
