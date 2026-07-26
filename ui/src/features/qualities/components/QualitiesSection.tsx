import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { useArchitectureQualitiesQuery } from "../api";
import { RATING_BADGE_VARIANT, RATING_ORDER } from "../schemas";

/**
 * The "Qualities" section on an architecture blueprint page. Reverse-resolves the
 * qualities catalog: fetches all qualities and keeps the manifestations targeting this
 * blueprint's slug (same client-side move as the architectures EvolutionSection).
 */
export function QualitiesSection({ blueprintSlug }: { blueprintSlug: string }) {
  const { t } = useTranslation();
  const { data } = useArchitectureQualitiesQuery({});

  const rows = (data?.items ?? [])
    .flatMap((quality) =>
      quality.manifestations
        .filter((m) => m.blueprint_slug === blueprintSlug)
        .map((m) => ({
          quality,
          rating: m.rating,
          statement: m.statement,
        })),
    )
    .sort((a, b) => RATING_ORDER[a.rating] - RATING_ORDER[b.rating]);
  if (rows.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">
        {t("qualities.blueprint_section.title")}
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <Link
            key={row.quality.id}
            to="/qualities/$id"
            params={{ id: row.quality.id }}
            className="flex items-start gap-3 rounded-xl border bg-card p-3 transition-shadow hover:shadow-md"
          >
            <Badge
              variant={RATING_BADGE_VARIANT[row.rating]}
              className="shrink-0"
            >
              {t(`qualities.rating.${row.rating}`)}
            </Badge>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium">{row.quality.name}</span>
              <span className="text-sm text-muted-foreground">
                {row.statement}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
