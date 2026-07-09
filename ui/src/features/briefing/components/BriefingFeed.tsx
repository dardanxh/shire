import { BookOpenIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import type { BriefingItemOut } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Prettify a hobit slug for display: "repo-onboarding" → "Repo onboarding". */
export function hobitName(slug: string) {
  const s = slug.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Tier → timeline dot tone. */
export function tierTone(tier: string) {
  if (tier === "NOW") return "bg-red-500";
  if (tier === "DAILY") return "bg-amber-500";
  return "bg-muted-foreground/40";
}

/** A vertical timeline of briefing posts. Shared by the Briefing page and per-hobit timelines. */
export function BriefingFeed({
  items,
  onSelect,
}: {
  items: BriefingItemOut[];
  onSelect: (post: BriefingItemOut) => void;
}) {
  return (
    <ol className="relative ml-2 space-y-4 border-l border-border pl-6">
      {items.map((post) => (
        <li key={post.id} className="relative">
          <span
            className={cn(
              "absolute -left-[27px] top-4 size-2.5 rounded-full ring-4 ring-background",
              tierTone(post.tier),
            )}
            aria-hidden
          />
          <Post post={post} onClick={() => onSelect(post)} />
        </li>
      ))}
    </ol>
  );
}

function Post({
  post,
  onClick,
}: {
  post: BriefingItemOut;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50"
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full text-primary",
            post.read_at ? "bg-muted" : "bg-primary/10",
          )}
        >
          <BookOpenIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {hobitName(post.hobit_slug)}
            </span>
            <span>·</span>
            <span className="font-mono">{post.repository_slug}</span>
            <span>·</span>
            <span>{formatDateTime(post.created_at)}</span>
            <Badge variant="outline" className="ml-1 text-[10px]">
              {t(`briefing.tiers.${post.tier.toLowerCase()}`)}
            </Badge>
            {!post.read_at ? (
              <span
                className="size-2 rounded-full bg-primary"
                title={t("briefing.unread")}
              />
            ) : null}
          </div>
          <p className="text-sm font-medium">{post.headline}</p>
        </div>
      </div>
    </button>
  );
}
