import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  SparklesIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTrackedJob } from "@/features/jobs";
import {
  useExplainDeltaMutation,
  useRepositoriesQuery,
} from "@/features/repositories/api";
import type { AnalysisDeltaOut, WatchlistEntryOut } from "@/lib/api";
import { formatDate } from "@/lib/format";
import {
  useMarkReviewedMutation,
  useRefreshWatchlistMutation,
  useSetWatchedMutation,
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

export function DevelopmentsPage() {
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
          <h1 className="text-xl font-semibold">{t("developments.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("developments.desc")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AddRepositoriesPicker
            watchedIds={entries.map((e) => e.repository.id)}
          />
          <Button
            onClick={() =>
              refreshAll(undefined, {
                onSuccess: (ids) =>
                  toast.success(
                    t("developments.refresh_toast", { count: ids.length }),
                  ),
              })
            }
            disabled={
              isRefreshQueueing || anyRefreshing || entries.length === 0
            }
          >
            {anyRefreshing ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <RefreshCwIcon className="size-4" />
            )}
            {anyRefreshing
              ? t("developments.refreshing")
              : t("developments.pull_latest")}
          </Button>
        </div>
      </div>

      {isPending ? null : entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <EyeIcon className="size-8 text-muted-foreground" />
            <p className="max-w-md text-sm text-muted-foreground">
              {t("developments.empty")}
            </p>
            <AddRepositoriesPicker watchedIds={[]} />
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

/** Popover picker of not-yet-watched repositories — click to add to the watchlist. */
function AddRepositoriesPicker({ watchedIds }: { watchedIds: string[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // The picker is a curated shortlist, not a browse surface — first 100 repos is plenty.
  const { data } = useRepositoriesQuery({ page: 1, page_size: 100 });
  const { mutate: setWatched, isPending } = useSetWatchedMutation();

  const watched = new Set(watchedIds);
  const candidates = (data?.items ?? []).filter((r) => !watched.has(r.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" />}>
        <PlusIcon className="size-4" />
        {t("developments.add_repos")}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Command>
          <CommandInput placeholder={t("developments.add_search")} />
          <CommandList>
            <CommandEmpty>
              {candidates.length === 0
                ? t("developments.add_all_watched")
                : t("developments.add_no_match")}
            </CommandEmpty>
            <CommandGroup>
              {candidates.map((repo) => (
                <CommandItem
                  key={repo.id}
                  value={repo.slug}
                  disabled={isPending}
                  onSelect={() =>
                    setWatched(
                      { id: repo.id, watched: true },
                      {
                        onSuccess: () => {
                          toast.success(t("developments.watch_toast"));
                          if (candidates.length === 1) setOpen(false);
                        },
                      },
                    )
                  }
                >
                  <EyeIcon className="size-3.5 text-muted-foreground" />
                  {repo.slug}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function WatchlistCard({ entry }: { entry: WatchlistEntryOut }) {
  const { t } = useTranslation();
  const repo = entry.repository;
  const refreshing = REFRESHING.has(repo.status);
  const { mutate: markReviewed, isPending: isMarking } =
    useMarkReviewedMutation();
  const { mutate: setWatched, isPending: isUnwatching } =
    useSetWatchedMutation();

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
              {t(`developments.status_${repo.status}`)}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {entry.delta ? (
            <Button
              size="sm"
              variant="outline"
              disabled={isMarking || refreshing}
              onClick={() =>
                markReviewed(repo.id, {
                  onSuccess: () =>
                    toast.success(t("developments.reviewed_toast")),
                })
              }
            >
              <CheckIcon className="size-3.5" />
              {t("developments.mark_reviewed")}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            disabled={isUnwatching}
            onClick={() =>
              setWatched(
                { id: repo.id, watched: false },
                {
                  onSuccess: () =>
                    toast.success(t("developments.unwatch_toast")),
                },
              )
            }
          >
            <EyeOffIcon className="size-3.5" />
            {t("developments.unwatch")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {entry.delta ? (
          <PendingDelta
            repoId={repo.id}
            delta={entry.delta}
            summaryPending={entry.summary_pending}
          />
        ) : entry.up_to_date ? (
          <p className="text-sm text-muted-foreground">
            {t("developments.up_to_date", {
              when: entry.reviewed
                ? formatDate(entry.reviewed.analyzed_at)
                : "",
            })}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("developments.baseline_only")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PendingDelta({
  repoId,
  delta,
  summaryPending,
}: {
  repoId: string;
  delta: AnalysisDeltaOut;
  summaryPending: boolean;
}) {
  const { t } = useTranslation();

  const facts = delta.facts.filter((f) => DIGEST_FACTS.has(f.field));

  return (
    <div className="flex flex-col gap-4">
      <DeltaNarrative
        repoId={repoId}
        delta={delta}
        summaryPending={summaryPending}
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">
          {delta.commits.has_commit_data
            ? t("developments.new_commits", { count: delta.commits.count })
            : t("developments.new_commits_approx", {
                count: delta.commits.count,
              })}
        </span>
        <span className="text-muted-foreground">
          {t("developments.since", {
            when: formatDate(delta.from_analyzed_at),
          })}
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
              {t(`developments.fact_${f.field}`)}:{" "}
              <span className="font-medium text-foreground">
                {String(f.before ?? "–")} → {String(f.after ?? "–")}
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DeltaNarrative({
  repoId,
  delta,
  summaryPending,
}: {
  repoId: string;
  delta: AnalysisDeltaOut;
  summaryPending: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { mutate: explain, isPending: isQueueing } =
    useExplainDeltaMutation(repoId);
  const { track, isTracking } = useTrackedJob((job) => {
    queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
    if (job.status === "succeeded") {
      toast.success(t("developments.summary_done"));
    } else {
      toast.error(job.error ?? t("developments.summary_failed"));
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

  // Summaries auto-generate after a pull; while the engine writes one, show progress
  // instead of the manual (fallback) button.
  if (summaryPending || isTracking) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" />
        {t("developments.summary_auto_pending")}
      </p>
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
        {busy ? t("developments.summarizing") : t("developments.summarize")}
      </Button>
    </div>
  );
}
