import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DataSafetyPractice } from "../api";
import { COMPLEXITY_BADGE_VARIANT, PRACTICE_CATEGORY_COLORS } from "../schemas";

export function PracticeCard({ practice }: { practice: DataSafetyPractice }) {
  const { t } = useTranslation();
  const stripeColor = PRACTICE_CATEGORY_COLORS[practice.category];
  const articleCount = practice.satisfies.reduce(
    (sum, entry) => sum + (entry.article_refs?.length ?? 0),
    0,
  );

  return (
    <Link
      to="/security/practices/$id"
      params={{ id: practice.id }}
      className="block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Card
        style={{ borderLeftColor: `${stripeColor}80` }}
        className={cn(
          "flex h-full flex-col gap-3 border-l-4 bg-card shadow-sm transition-shadow hover:shadow-lg",
        )}
      >
        <CardHeader>
          <span className="font-medium">{practice.name}</span>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {practice.objective}
          </p>
          {articleCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("security.card.satisfies_summary", {
                articles: articleCount,
                regulations: practice.satisfies.length,
              })}
            </p>
          )}
          <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t pt-3">
            <Badge variant="accent">
              {t(`security.practice_category.${practice.category}`)}
            </Badge>
            <Badge variant={COMPLEXITY_BADGE_VARIANT[practice.complexity]}>
              {t(`security.complexity.${practice.complexity}`)}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
