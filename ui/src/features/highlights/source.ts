import { useQueryClient } from "@tanstack/react-query";
import { useMatches } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { councilKeys } from "@/features/council/keys";
import { mergeReviewKeys } from "@/features/merge-reviews/keys";
import { repositoryKeys } from "@/features/repositories/keys";
import { REPOSITORY_TAB_VALUES } from "@/features/repositories/tabs";
import { roadmapKeys } from "@/features/roadmaps/keys";
import type {
  CouncilTopicDetailOut,
  HighlightIn,
  HighlightOut,
  MergeReviewDetailOut,
  RepositoryOut,
  RoadmapDetailOut,
} from "@/lib/api";

/**
 * The two halves of a highlight's provenance, kept in one file so they can't drift:
 *
 * - `useHighlightSource()` — where the user is reading right now, captured when they save.
 * - `highlightTarget()` — the link back, resolved from the saved `source_kind`.
 *
 * The database stores a kind + an entity id, never a URL (mirroring `activity_log`), so the
 * routing table lives here. This is the same split as `ActivityFeedCard.navigateToEvent`.
 */

/** Just the provenance fields — the caller adds the selected `text`. */
export type HighlightSource = Omit<HighlightIn, "text">;

/** Where a saved highlight links to, or null when its page no longer maps to a route. */
export type HighlightTarget =
  | { to: "/repositories/$id"; params: { id: string }; search: { tab: string } }
  | { to: "/merge-reviews/$id"; params: { id: string } }
  | { to: "/council/$id"; params: { id: string } }
  | { to: "/roadmaps/$id"; params: { id: string } }
  | { to: "/developments"; search: { tab: "feed" | "pulse" } };

const REPOSITORY_PREFIX = "repository.";
const DEVELOPMENTS_PREFIX = "developments.";

export function useHighlightSource(): () => HighlightSource {
  const { t } = useTranslation();
  const matches = useMatches();
  const queryClient = useQueryClient();

  // Resolved on click rather than per render: the label reads from the Query cache, which the
  // page has already filled, and there's no point recomputing it on every keystroke elsewhere.
  return () => {
    // The router types params/search per route; this switch is deliberately route-agnostic,
    // so read them as plain records.
    const match = matches[matches.length - 1];
    const params = (match?.params ?? {}) as Record<string, string | undefined>;
    const search = (match?.search ?? {}) as Record<string, unknown>;
    const routeId = match?.routeId ?? "";
    const id = params.id ?? "";

    switch (routeId) {
      case "/repositories/$id": {
        const tab = String(search.tab ?? "overview");
        const slug =
          queryClient.getQueryData<RepositoryOut>(repositoryKeys.detail(id))
            ?.slug ?? t("common.nav.repositories");
        return {
          source_kind: `${REPOSITORY_PREFIX}${tab}`,
          source_id: id,
          source_label: `${slug} · ${repositoryTabLabel(tab, t)}`,
          repository_id: id,
        };
      }
      case "/merge-reviews/$id": {
        const review = queryClient.getQueryData<MergeReviewDetailOut>(
          mergeReviewKeys.detail(id),
        );
        const label = review
          ? `${review.repo_slug} · ${review.source_branch}`
          : t("common.nav.merge_reviews");
        return {
          source_kind: "merge_review",
          source_id: id,
          source_label: label,
          repository_id: review?.repository_id ?? null,
        };
      }
      case "/council/$id": {
        const topic = queryClient.getQueryData<CouncilTopicDetailOut>(
          councilKeys.detail(id),
        );
        return {
          source_kind: "council",
          source_id: id,
          source_label: topic?.name ?? t("common.nav.council"),
          repository_id: null,
        };
      }
      case "/roadmaps/$id": {
        const roadmap = queryClient.getQueryData<RoadmapDetailOut>(
          roadmapKeys.detail(id),
        );
        return {
          source_kind: "roadmap",
          source_id: id,
          source_label: roadmap?.name ?? t("common.nav.roadmaps"),
          repository_id: null,
        };
      }
      case "/developments": {
        const tab = search.tab === "pulse" ? "pulse" : "feed";
        return {
          source_kind: `${DEVELOPMENTS_PREFIX}${tab}`,
          source_id: null,
          source_label: `${t("common.nav.developments")} · ${t(
            `developments.tab_${tab}`,
          )}`,
          repository_id: null,
        };
      }
      default: {
        // An unmapped page: keep the passage (losing it would be worse) and label it from the
        // route's breadcrumb. It saves without a link — `highlightTarget` returns null.
        const crumb = [...matches].reverse().find((m) => m.staticData.crumb)
          ?.staticData.crumb;
        return {
          source_kind: "page",
          source_id: null,
          source_label: crumb ? t(crumb) : t("highlights.unknown_source"),
          repository_id: null,
        };
      }
    }
  };
}

/** Tab labels live with the repository view; hyphenated tabs are underscored as keys. */
function repositoryTabLabel(tab: string, t: (key: string) => string): string {
  const known = (REPOSITORY_TAB_VALUES as readonly string[]).includes(tab);
  return known ? t(`repositories.view.tabs.${tab.replace(/-/g, "_")}`) : tab;
}

export function highlightTarget(
  highlight: HighlightOut,
): HighlightTarget | null {
  const { source_kind: kind, source_id: id } = highlight;

  if (kind.startsWith(REPOSITORY_PREFIX) && id) {
    const tab = kind.slice(REPOSITORY_PREFIX.length);
    return { to: "/repositories/$id", params: { id }, search: { tab } };
  }
  if (kind.startsWith(DEVELOPMENTS_PREFIX)) {
    const tab = kind.slice(DEVELOPMENTS_PREFIX.length);
    return {
      to: "/developments",
      search: { tab: tab === "pulse" ? "pulse" : "feed" },
    };
  }
  if (!id) return null;
  switch (kind) {
    case "merge_review":
      return { to: "/merge-reviews/$id", params: { id } };
    case "council":
      return { to: "/council/$id", params: { id } };
    case "roadmap":
      return { to: "/roadmaps/$id", params: { id } };
    default:
      return null;
  }
}
