import { useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

/**
 * Stable tint per top-level category group — the group slug hashes into the theme's
 * chart tokens, so a group keeps its color across renders (mirrors StackPanel's palette).
 */
const TINTS = [
  "bg-chart-1/15 text-chart-1",
  "bg-chart-2/15 text-chart-2",
  "bg-chart-3/15 text-chart-3",
  "bg-chart-4/15 text-chart-4",
  "bg-chart-5/15 text-chart-5",
];

function tintClass(groupSlug: string | undefined): string {
  if (!groupSlug) return "bg-muted text-muted-foreground";
  let hash = 0;
  for (const char of groupSlug) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return TINTS[hash % TINTS.length];
}

function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** hostname of a homepage URL, without the leading www. — null when unusable. */
function logoDomain(homepageUrl: string | null | undefined): string | null {
  if (!homepageUrl) return null;
  try {
    return new URL(homepageUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * A technology's logo: the site's favicon (via Google's favicon service, which resolves
 * an icon for essentially any domain — including subdomains like `kafka.apache.org`),
 * degrading to a colored monogram (initials, tinted by category group) only when there's
 * no homepage URL or the icon fails to load / we're offline.
 *
 * (We previously used logo.clearbit.com, but HubSpot shut that free API down — it no longer
 * resolves, so every card fell back to a monogram.)
 */
export function TechnologyLogo({
  name,
  homepageUrl,
  groupSlug,
  className,
}: {
  name: string;
  homepageUrl: string | null | undefined;
  groupSlug: string | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const domain = logoDomain(homepageUrl);
  const [failed, setFailed] = useState(false);

  const base = cn(
    "grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg",
    className,
  );

  if (!domain || failed) {
    return (
      <div className={cn(base, tintClass(groupSlug))}>
        <span className="text-xs font-semibold">{monogram(name)}</span>
      </div>
    );
  }

  return (
    <div className={cn(base, "border bg-background")}>
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
        alt={t("technologies.card.logo_alt", { name })}
        loading="lazy"
        className="size-6 object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
