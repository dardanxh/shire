import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CheckIcon,
  EyeIcon,
  Loader2Icon,
  RefreshCwIcon,
  SparklesIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTrackedJob } from "@/features/jobs";
import { useExplainDeltaMutation } from "@/features/repositories/api";
import type { AnalysisDeltaOut, WatchlistEntryOut } from "@/lib/api";
import { formatDate } from "@/lib/format";
import {
  useMarkReviewedMutation,
  useRefreshWatchlistMutation,
  useWatchlistQuery,
} from "../api";
import { watchlistKeys } from "../keys";

const REFRESHING = new Set(["cloning", "analyzing"]);

// Digest-worthy scalar facts, in display order (the delta carries many more).
const DIGEST_FACTS = new Set([
  "loc_total",
  "vulnerability_count",
  "health_score",
  "dependency_count",
  "test_count",
]);

export function WatchlistPage() {
  const { t } = useTranslation();
  const { data, isPending } = useWatchlistQuery();
  const { mutate: refreshAll, isPending: isRefreshQueueing } =
    useRefreshWatchlistMutation();

  const entries = data?.entries ?? [];
  const anyRefreshing = entries.some((e) =>
    REFRESHING.has(e.repository.status),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("watchlist.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("watchlist.desc")}
          </p>
        </div>
        <Button
          onClick={() =>
            refreshAll(undefined, {
              onSuccess: (ids) =>
                toast.success(
                  t("watchlist.refresh_toast", { count: ids.length }),
                ),
            })
          }
          disabled={isRefreshQueueing || anyRefreshing || entries.length === 0}
        >
          {anyRefreshing ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <RefreshCwIcon className="size-4" />
          )}
          {anyRefreshing
            ? t("watchlist.refreshing")
            : t("watchlist.pull_latest")}
        </Button>
      </div>

      {isPending ? null : entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <EyeIcon className="size-8 text-muted-foreground" />
            <p className="max-w-md text-sm text-muted-foreground">
              {t("watchlist.empty")}
            </p>
            <Button
              variant="outline"
              render={
                <Link
                  to="/repositories"
                  search={{ view: "repositories", page: 1, size: 20 }}
                />
              }
            >
              {t("watchlist.empty_cta")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        entries.map((entry) => (
          <WatchlistCard key={entry.repository.id} entry={entry} />
        ))
      )}
    </div>
  );
}

function WatchlistCard({ entry }: { entry: WatchlistEntryOut }) {
  const { t } = useTranslation();
  const repo = entry.repository;
  const refreshing = REFRESHING.has(repo.status);
  const { mutate: markReviewed, isPending: isMarking } =
    useMarkReviewedMutation();

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">
            <Link
              to="/repositories/$id"
              params={{ id: repo.id }}
              search={{ tab: "overview" }}
              className="hover:underline"
            >
              {repo.slug}
            </Link>
          </CardTitle>
          {refreshing ? (
            <Badge variant="secondary" className="gap-1">
              <Loader2Icon className="size-3 animate-spin" />
              {t(`watchlist.status_${repo.status}`)}
            </Badge>
          ) : null}
        </div>
        {entry.delta ? (
          <Button
            size="sm"
            variant="outline"
            disabled={isMarking || refreshing}
            onClick={() =>
              markReviewed(repo.id, {
                onSuccess: () => toast.success(t("watchlist.reviewed_toast")),
              })
            }
          >
            <CheckIcon className="size-3.5" />
            {t("watchlist.mark_reviewed")}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {entry.delta ? (
          <PendingDelta repoId={repo.id} delta={entry.delta} />
        ) : entry.up_to_date ? (
          <p className="text-sm text-muted-foreground">
            {t("watchlist.up_to_date", {
              when: entry.reviewed
                ? formatDate(entry.reviewed.analyzed_at)
                : "",
            })}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("watchlist.baseline_only")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PendingDelta({
  repoId,
  delta,
}: {
  repoId: string;
  delta: AnalysisDeltaOut;
}) {
  const { t } = useTranslation();

  const facts = delta.facts.filter((f) => DIGEST_FACTS.has(f.field));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">
          {delta.commits.has_commit_data
            ? t("watchlist.new_commits", { count: delta.commits.count })
            : t("watchlist.new_commits_approx", { count: delta.commits.count })}
        </span>
        <span className="text-muted-foreground">
          {t("watchlist.since", { when: formatDate(delta.from_analyzed_at) })}
        </span>
        <code className="font-mono text-xs text-muted-foreground">
          {delta.from_commit_sha.slice(0, 8)} →{" "}
          {delta.to_commit_sha.slice(0, 8)}
        </code>
      </div>

      {delta.commits.authors.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {delta.commits.authors.map((a) => (
            <Badge key={a.email} variant="secondary" className="font-normal">
              {a.email}
              <span className="ml-1 text-muted-foreground">×{a.commits}</span>
            </Badge>
          ))}
        </div>
      ) : null}

      {facts.length > 0 ? (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {facts.map((f) => (
            <span key={f.field} className="text-muted-foreground">
              {t(`watchlist.fact_${f.field}`)}:{" "}
              <span className="font-medium text-foreground">
                {String(f.before ?? "–")} → {String(f.after ?? "–")}
              </span>
            </span>
          ))}
        </div>
      ) : null}

      <DeltaNarrative repoId={repoId} delta={delta} />
    </div>
  );
}

function DeltaNarrative({
  repoId,
  delta,
}: {
  repoId: string;
  delta: AnalysisDeltaOut;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { mutate: explain, isPending: isQueueing } =
    useExplainDeltaMutation(repoId);
  const { track, isTracking } = useTrackedJob((job) => {
    queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
    if (job.status === "succeeded") {
      toast.success(t("watchlist.summary_done"));
    } else {
      toast.error(job.error ?? t("watchlist.summary_failed"));
    }
  });
  const busy = isQueueing || isTracking;

  if (delta.note) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-wrap">
        {delta.note}
      </div>
    );
  }

  return (
    <div>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() =>
          explain(
            { from_id: delta.from_analysis_id, to_id: delta.to_analysis_id },
            { onSuccess: (job) => track(job.id) },
          )
        }
      >
        {busy ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <SparklesIcon className="size-3.5" />
        )}
        {busy ? t("watchlist.summarizing") : t("watchlist.summarize")}
      </Button>
    </div>
  );
}
