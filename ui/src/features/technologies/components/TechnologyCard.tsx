import { Link } from "@tanstack/react-router";
import { StarIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { type Technology, useUpdateTechnologyMutation } from "../api";

/* Washed tints keep maturity scannable without dominating the grid — the corpus
 * is mostly "established", so that state especially must stay quiet. */
export const MATURITY_BADGE_VARIANT = {
  emerging: "accent",
  established: "success",
  legacy: "warning",
} as const;

/**
 * One corpus technology as a browse card — deliberately minimal: logo, name, its
 * category, a one-glance description, and the two dimensions people scan for
 * (open-source and maturity). Slug, deployment models, and tags live on the
 * detail page rather than crowding the grid.
 */
export function TechnologyCard({
  technology,
  categoryName,
  logo,
  selected = false,
  selectionActive = false,
  selectionFull = false,
  onToggleSelect,
}: {
  technology: Technology;
  categoryName: string | undefined;
  /** The rendered <TechnologyLogo> — injected so the card stays presentational. */
  logo: React.ReactNode;
  /** Compare selection (max 3) — checkbox hidden when no handler is passed. */
  selected?: boolean;
  /** Any card selected — keeps every checkbox visible mid-comparison. */
  selectionActive?: boolean;
  selectionFull?: boolean;
  onToggleSelect?: () => void;
}) {
  const { t } = useTranslation();
  const { mutate: updateTechnology } = useUpdateTechnologyMutation(
    technology.id,
  );

  return (
    <div className="group relative h-full">
      <Link
        to="/technologies/$id"
        params={{ id: technology.id }}
        className="block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Card className="flex h-full flex-col gap-3 bg-card shadow-sm transition-shadow group-hover:shadow-lg">
          <CardHeader className="flex flex-row items-center gap-3 pr-16">
            {logo}
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{technology.name}</span>
              {categoryName && (
                <span className="truncate text-xs text-muted-foreground">
                  {categoryName}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            {technology.description && (
              <p className="line-clamp-3 text-sm text-muted-foreground">
                {technology.description}
              </p>
            )}
            <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t pt-3">
              <Badge variant={MATURITY_BADGE_VARIANT[technology.maturity]}>
                {t(`technologies.maturity.${technology.maturity}`)}
              </Badge>
              {technology.oss && (
                <Badge variant="accent">{t("technologies.oss.yes")}</Badge>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {t(`technologies.adoption.tier_${technology.cost_tier}`)}
                {" · "}
                {t(`technologies.adoption.ttw_${technology.time_to_win}`)}
              </span>
            </div>
          </CardContent>
        </Card>
      </Link>
      {onToggleSelect && (
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          disabled={!selected && selectionFull}
          aria-label={t("technologies.list.select_compare", {
            name: technology.name,
          })}
          className={cn(
            "absolute top-4 right-10 border-muted-foreground/40 bg-card",
            // Hidden at rest; revealed on hover/focus or while comparing.
            !selected &&
              !selectionActive &&
              "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
          )}
        />
      )}
      {/* Sibling of the Link (not a child) so starring never navigates. */}
      <button
        type="button"
        onClick={() => updateTechnology({ starred: !technology.starred })}
        aria-label={t(
          technology.starred
            ? "technologies.list.unstar_aria"
            : "technologies.list.star_aria",
          { name: technology.name },
        )}
        className={cn(
          "absolute top-3 right-3 rounded-md p-1 transition-colors",
          technology.starred
            ? "text-warning"
            : "text-muted-foreground/40 hover:text-warning",
        )}
      >
        <StarIcon
          className={cn("size-4", technology.starred && "fill-warning")}
        />
      </button>
    </div>
  );
}
