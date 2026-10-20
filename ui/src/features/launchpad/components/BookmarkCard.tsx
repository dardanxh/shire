import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon, StarIcon, ZapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  type Bookmark,
  useRecordVisitMutation,
  useUpdateBookmarkMutation,
} from "../api";
import { BookmarkLogo } from "./BookmarkLogo";

/**
 * One bookmark tile. The card body opens the bookmark's page (details, action,
 * runs); "Visit page" and the star are siblings of that link, so they never
 * navigate inside Shire. Visit is a real anchor — middle-click and
 * cmd-click keep working — and counts the visit for the most-used ordering.
 */
export function BookmarkCard({
  bookmark,
  highlighted = false,
}: {
  bookmark: Bookmark;
  /** The search's top match — Enter in the search box opens it. */
  highlighted?: boolean;
}) {
  const { t } = useTranslation();
  const { mutate: updateBookmark } = useUpdateBookmarkMutation(bookmark.id);
  const { mutate: recordVisit } = useRecordVisitMutation();
  const action = bookmark.action;

  return (
    <div className="group relative h-full">
      <Link
        to="/launchpad/$id"
        params={{ id: bookmark.id }}
        search={{ tab: "details", page: 1 }}
        className="block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Card
          className={cn(
            "flex h-full flex-col gap-3 bg-card p-4 pb-14 shadow-sm transition-shadow group-hover:shadow-lg",
            highlighted && "ring-2 ring-primary/40",
          )}
        >
          <div className="flex items-center gap-3 pr-8">
            <BookmarkLogo bookmark={bookmark} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{bookmark.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {bookmark.host}
              </span>
            </div>
          </div>
          {bookmark.description ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {bookmark.description}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            {bookmark.category_name ? (
              <Badge variant="secondary">{bookmark.category_name}</Badge>
            ) : null}
            {action ? <ActionBadge action={action} /> : null}
          </div>
        </Card>
      </Link>

      {/* Siblings of the Link (not children) so they never open the detail page. */}
      <button
        type="button"
        onClick={() => updateBookmark({ starred: !bookmark.starred })}
        aria-label={t(
          bookmark.starred ? "launchpad.card.unstar" : "launchpad.card.star",
          { name: bookmark.name },
        )}
        className={cn(
          "absolute top-3 right-3 rounded-md p-1 transition-colors",
          bookmark.starred
            ? "text-warning"
            : "text-muted-foreground/40 hover:text-warning",
        )}
      >
        <StarIcon
          className={cn("size-4", bookmark.starred && "fill-warning")}
        />
      </button>
      <a
        href={bookmark.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => recordVisit(bookmark.id)}
        onAuxClick={() => recordVisit(bookmark.id)}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "absolute right-4 bottom-4 left-4 bg-background",
        )}
      >
        <ExternalLinkIcon className="size-3.5" />
        {t("launchpad.card.visit")}
      </a>
    </div>
  );
}

function ActionBadge({ action }: { action: NonNullable<Bookmark["action"]> }) {
  const { t } = useTranslation();
  if (action.unread_count > 0) {
    return (
      <Badge variant="warning">
        <ZapIcon className="size-3" />
        {t("launchpad.card.needs_you", { count: action.unread_count })}
      </Badge>
    );
  }
  if (action.last_status === "pending") {
    return (
      <Badge variant="outline">
        <ZapIcon className="size-3 animate-pulse" />
        {t("launchpad.card.running")}
      </Badge>
    );
  }
  return (
    <Badge variant={action.enabled ? "accent" : "outline"}>
      <ZapIcon className="size-3" />
      {action.enabled && action.cadence !== "manual"
        ? t(`launchpad.cadence.${action.cadence}`, {
            defaultValue: action.cadence,
          })
        : t("launchpad.card.manual_action")}
    </Badge>
  );
}
