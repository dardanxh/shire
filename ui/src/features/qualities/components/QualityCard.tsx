import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ArchitectureQuality } from "../api";
import { QUALITY_CATEGORY_COLORS } from "../schemas";

export function QualityCard({ quality }: { quality: ArchitectureQuality }) {
  const { t } = useTranslation();
  const stripeColor = QUALITY_CATEGORY_COLORS[quality.category];

  return (
    <Link
      to="/qualities/$id"
      params={{ id: quality.id }}
      className="block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Card
        style={{ borderLeftColor: `${stripeColor}80` }}
        className={cn(
          "flex h-full flex-col gap-3 border-l-4 bg-card shadow-sm transition-shadow hover:shadow-lg",
        )}
      >
        <CardHeader>
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
  );
}
