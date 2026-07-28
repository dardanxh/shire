import { Link } from "@tanstack/react-router";
import { StarIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  type ArchitectureQuality,
  useUpdateArchitectureQualityMutation,
} from "../api";
import { QUALITY_CATEGORY_COLORS } from "../schemas";

export function QualityCard({ quality }: { quality: ArchitectureQuality }) {
  const { t } = useTranslation();
  const { mutate: updateQuality } = useUpdateArchitectureQualityMutation(
    quality.id,
  );
  const stripeColor = QUALITY_CATEGORY_COLORS[quality.category];

  return (
    <div className="group relative h-full">
      <Link
        to="/qualities/$id"
        params={{ id: quality.id }}
        className="block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Card
          style={{ borderLeftColor: `${stripeColor}80` }}
          className={cn(
            "flex h-full flex-col gap-3 border-l-4 bg-card shadow-sm transition-shadow group-hover:shadow-lg",
          )}
        >
          <CardHeader className="pr-10">
            <span className="font-medium">{quality.name}</span>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            <p className="line-clamp-3 text-sm text-muted-foreground">
              {quality.summary}
            </p>
            <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t pt-3">
              <Badge variant="accent">
                {t(`qualities.category.${quality.category}`)}
              </Badge>
              {quality.manifestations.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {t("qualities.card.architectures", {
                    count: quality.manifestations.length,
                  })}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </Link>
      {/* Sibling of the Link (not a child) so starring never navigates. */}
      <button
        type="button"
        onClick={() => updateQuality({ starred: !quality.starred })}
        aria-label={t(
          quality.starred
            ? "qualities.list.unstar_aria"
            : "qualities.list.star_aria",
          { name: quality.name },
        )}
        className={cn(
          "absolute top-3 right-3 rounded-md p-1 transition-colors",
          quality.starred
            ? "text-warning"
            : "text-muted-foreground/40 hover:text-warning",
        )}
      >
        <StarIcon className={cn("size-4", quality.starred && "fill-warning")} />
      </button>
    </div>
  );
}
