import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DataRegulation } from "../api";
import { REGULATION_CATEGORY_COLORS } from "../schemas";

export function RegulationCard({ regulation }: { regulation: DataRegulation }) {
  const { t } = useTranslation();
  const stripeColor = REGULATION_CATEGORY_COLORS[regulation.category];

  return (
    <Link
      to="/security/regulations/$id"
      params={{ id: regulation.id }}
      className="block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Card
        style={{ borderLeftColor: `${stripeColor}80` }}
        className={cn(
          "flex h-full flex-col gap-3 border-l-4 bg-card shadow-sm transition-shadow hover:shadow-lg",
        )}
      >
        <CardHeader>
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{regulation.name}</span>
            <span className="line-clamp-1 text-xs text-muted-foreground">
              {regulation.full_name}
            </span>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {regulation.description}
          </p>
          <p className="text-xs text-muted-foreground">
            {regulation.jurisdiction}
            {regulation.effective_year ? ` · ${regulation.effective_year}` : ""}
            {" · "}
            {t("security.card.articles", { count: regulation.articles.length })}
          </p>
          <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t pt-3">
            <Badge variant="accent">
              {t(`security.category.${regulation.category}`)}
            </Badge>
            <Badge variant="outline">
              {t(`security.region.${regulation.region}`)}
            </Badge>
            {regulation.status === "phasing_in" && (
              <Badge variant="warning">
                {t(`security.status.${regulation.status}`)}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
