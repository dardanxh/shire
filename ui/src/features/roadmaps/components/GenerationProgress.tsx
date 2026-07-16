import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { JobStatusBadge } from "@/features/jobs";
import type { RoadmapVersionOut } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * The detail page while a generation is in flight (or failed): skeleton
 * milestones + the engine job's live status, with a retry on failure. The
 * parent's detail query polls, so this flips to the plan on its own.
 */
export function GenerationProgress({
  generation,
  onRetry,
  isRetrying,
  compact = false,
}: {
  generation: RoadmapVersionOut;
  onRetry: () => void;
  isRetrying: boolean;
  /** Banner only — used while a re-plan runs on top of an existing plan. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const failed = generation.status === "error";

  return (
    <div className="space-y-4">
      <Card className="flex-row items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {failed
              ? t("roadmaps.generation.failed_title")
              : t("roadmaps.generation.running_title", {
                  number: generation.number,
                })}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {failed
              ? (generation.error ?? t("roadmaps.generation.failed_body"))
              : t("roadmaps.generation.running_body")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <JobStatusBadge status={failed ? "failed" : "running"} />
          {generation.job_id ? (
            <Link
              to="/jobs/$id"
              params={{ id: generation.job_id }}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {t("roadmaps.generation.view_job")}
            </Link>
          ) : null}
          {failed ? (
            <Button size="sm" onClick={onRetry} disabled={isRetrying}>
              {t("common.actions.retry")}
            </Button>
          ) : null}
        </div>
      </Card>

      {failed || compact ? null : (
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="gap-3 p-4">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <div className="space-y-2 pt-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-4/5" />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
