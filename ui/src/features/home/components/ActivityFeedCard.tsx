import { useNavigate } from "@tanstack/react-router";
import {
  ActivityIcon,
  BookOpenIcon,
  BotIcon,
  FolderGit2Icon,
  GitMergeIcon,
  HelpCircleIcon,
  HistoryIcon,
  LayersIcon,
  type LucideIcon,
  MapIcon,
  MessagesSquareIcon,
  NetworkIcon,
  PackageIcon,
  RefreshCwIcon,
  RocketIcon,
  ScaleIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ActivityEventOut } from "@/lib/api";
import { formatTimeAgo } from "@/lib/format";
import { useActivityFeedQuery } from "../api";

const KIND_ICONS: Record<string, LucideIcon> = {
  "repository.onboarded": FolderGit2Icon,
  "repository.analyzed": RefreshCwIcon,
  "council.convened": MessagesSquareIcon,
  "merge_review.created": GitMergeIcon,
  "hobit.run": BotIcon,
  "substrate.architecture": NetworkIcon,
  "substrate.codebase_overview": BookOpenIcon,
  "substrate.tech_stack": LayersIcon,
  "substrate.dependency_gains": PackageIcon,
  "substrate.evolution_note": HistoryIcon,
  "principle.audit": ScaleIcon,
  "repo.question": HelpCircleIcon,
  "readiness.suggest": SparklesIcon,
  "readiness.apply": SparklesIcon,
  "compliance.check": ShieldCheckIcon,
  "roadmap.generate": MapIcon,
  "roadmap.execute": RocketIcon,
};

/** Where clicking an event lands: the source entity for synthesized kinds, the job page
 * for job-backed ones. */
function navigateToEvent(
  event: ActivityEventOut,
  navigate: ReturnType<typeof useNavigate>,
) {
  switch (event.kind) {
    case "repository.onboarded":
    case "repository.analyzed":
      if (event.repository_id)
        navigate({
          to: "/repositories/$id",
          params: { id: event.repository_id },
          search: { tab: "overview", tool: undefined },
        });
      return;
    case "council.convened":
      navigate({ to: "/council/$id", params: { id: event.id } });
      return;
    case "merge_review.created":
      navigate({ to: "/merge-reviews/$id", params: { id: event.id } });
      return;
    default:
      navigate({ to: "/jobs/$id", params: { id: event.id } });
  }
}

function StatusDot({ status }: { status: string | null }) {
  if (status === "failed" || status === "error")
    return <span className="size-1.5 shrink-0 rounded-full bg-red-500" />;
  if (status === "running" || status === "pending")
    return (
      <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-amber-500" />
    );
  return null;
}

/**
 * The "what happened recently" feed: a derived, reverse-chronological log of work
 * (jobs, onboardings, refreshes, councils, merge reviews), 15 at a time.
 */
export function ActivityFeedCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    data,
    isPending,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useActivityFeedQuery();

  if (isPending || isError) return null;

  const events = data.pages.flatMap((page) => page.items);

  return (
    <Card className="gap-2 p-5">
      <h2 className="text-sm font-semibold">{t("home.activity.title")}</h2>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("home.activity.empty")}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {events.map((event) => {
            const Icon = KIND_ICONS[event.kind] ?? ActivityIcon;
            const kindKey = event.kind.replace(/\./g, "_");
            const label = t(`home.activity.kinds.${kindKey}`, {
              defaultValue: t("home.activity.kinds.fallback"),
            });
            // Job titles often carry the repo slug ("Tech stack — owner/name") and
            // sometimes little else — the chip and the label already say both.
            let title = event.title;
            if (event.repository_slug) {
              title = title
                .replace(` — ${event.repository_slug}`, "")
                .replace(event.repository_slug, "")
                .trim();
            }
            if (title.toLowerCase() === label.toLowerCase()) title = "";
            return (
              <li key={`${event.kind}:${event.id}`}>
                <button
                  type="button"
                  onClick={() => navigateToEvent(event, navigate)}
                  className="flex w-full items-center gap-3 py-2 text-left text-sm hover:bg-muted/40"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{label}</span>
                    {title ? (
                      <span className="text-muted-foreground"> — {title}</span>
                    ) : null}
                  </span>
                  {event.repository_slug ? (
                    <span className="hidden max-w-48 truncate rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground sm:inline">
                      {event.repository_slug}
                    </span>
                  ) : null}
                  <StatusDot status={event.status} />
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatTimeAgo(event.occurred_at)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {hasNextPage ? (
        <Button
          variant="outline"
          size="sm"
          className="self-center"
          disabled={isFetchingNextPage}
          onClick={() => fetchNextPage()}
        >
          {isFetchingNextPage
            ? t("home.activity.loading")
            : t("home.activity.load_more")}
        </Button>
      ) : null}
    </Card>
  );
}
