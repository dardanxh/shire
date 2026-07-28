import { Link } from "@tanstack/react-router";
import { StarIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  type ModellingStrategy,
  useUpdateModellingStrategyMutation,
} from "../api";
import { COMPLEXITY_BADGE_VARIANT } from "../schemas";

/**
 * One strategy as a browse card: name, family, a one-glance description, and a
 * washed complexity badge + best-for hint in the footer. Pros/cons, example,
 * diagram and related technologies live on the detail page.
 */
export function ModellingStrategyCard({
  strategy,
  selected = false,
  selectionActive = false,
  selectionFull = false,
  onToggleSelect,
}: {
  strategy: ModellingStrategy;
  /** Compare selection (max 3) — checkbox hidden when no handler is passed. */
  selected?: boolean;
  /** Any card selected — keeps every checkbox visible mid-comparison. */
  selectionActive?: boolean;
  selectionFull?: boolean;
  onToggleSelect?: () => void;
}) {
  const { t } = useTranslation();
  const { mutate: updateStrategy } = useUpdateModellingStrategyMutation(
    strategy.id,
  );
  return (
    <div className="group relative h-full">
      <Link
        to="/data/$id"
        params={{ id: strategy.id }}
        className="block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Card className="flex h-full flex-col gap-3 bg-card shadow-sm transition-shadow group-hover:shadow-lg">
          <CardHeader className="pr-16">
            <span className="truncate font-medium">{strategy.name}</span>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            {strategy.best_for && (
              <p className="line-clamp-3 text-sm text-muted-foreground">
                {strategy.best_for}
              </p>
            )}
            <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t pt-3">
              <Badge variant="accent">
                {t(`modelling.family.${strategy.family}`)}
              </Badge>
              <Badge variant={COMPLEXITY_BADGE_VARIANT[strategy.complexity]}>
                {t(`modelling.complexity.${strategy.complexity}`)}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </Link>
      {/* Sibling of the Link so toggling never navigates. */}
      {onToggleSelect && (
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          disabled={!selected && selectionFull}
          aria-label={t("modelling.list.select_compare", {
            name: strategy.name,
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
        onClick={() => updateStrategy({ starred: !strategy.starred })}
        aria-label={t(
          strategy.starred
            ? "modelling.list.unstar_aria"
            : "modelling.list.star_aria",
          { name: strategy.name },
        )}
        className={cn(
          "absolute top-3 right-3 rounded-md p-1 transition-colors",
          strategy.starred
            ? "text-warning"
            : "text-muted-foreground/40 hover:text-warning",
        )}
      >
        <StarIcon
          className={cn("size-4", strategy.starred && "fill-warning")}
        />
      </button>
    </div>
  );
}
