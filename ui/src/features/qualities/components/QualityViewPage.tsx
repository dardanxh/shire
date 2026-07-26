import { getRouteApi, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useArchitectureQualitiesQuery,
  useArchitectureQualityQuery,
} from "../api";
import { QUALITY_CATEGORY_COLORS } from "../schemas";
import { QualityTechChips } from "./QualityTechChips";

const route = getRouteApi("/qualities/$id");

export function QualityViewPage() {
  const { t } = useTranslation();
  const { id } = route.useParams();

  const { data: quality, isPending } = useArchitectureQualityQuery(id);

  if (isPending || !quality) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const stripeColor = QUALITY_CATEGORY_COLORS[quality.category];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold">{quality.name}</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant="accent"
            style={{ backgroundColor: `${stripeColor}26` }}
          >
            {t(`qualities.category.${quality.category}`)}
          </Badge>
        </div>
      </div>

      {(quality.summary || quality.description) && (
        <Card className="w-full">
          <CardContent className="flex flex-col gap-3 pt-4">
            {quality.summary && (
              <p className="text-sm leading-relaxed">{quality.summary}</p>
            )}
            {quality.description && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {quality.description}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {quality.mechanisms.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">
            {t("qualities.view.how_achieved")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {quality.mechanisms.map((mechanism) => (
              <div
                key={mechanism.name}
                className="flex flex-col gap-2 rounded-xl border bg-card p-4"
              >
                <span className="font-medium text-sm">{mechanism.name}</span>
                {mechanism.note && (
                  <p className="text-sm text-muted-foreground">
                    {mechanism.note}
                  </p>
                )}
                <QualityTechChips
                  slugs={mechanism.related_technology_slugs ?? []}
                  compact
                />
              </div>
            ))}
          </div>
        </section>
      )}

      <TradeoffsSection tradeoffs={quality.tradeoffs} />

      <RelatedQualities slugs={quality.related_quality_slugs} />
    </div>
  );
}

/** What you give up to achieve the quality; each links to the sacrificed quality. */
function TradeoffsSection({
  tradeoffs,
}: {
  tradeoffs: {
    title: string;
    note: string;
    quality_slug?: string | null;
  }[];
}) {
  const { t } = useTranslation();
  const { data } = useArchitectureQualitiesQuery({});

  // Resolve quality_slug → quality (for a link) client-side; falls back to a plain badge.
  const bySlug = new Map((data?.items ?? []).map((x) => [x.slug, x]));
  if (tradeoffs.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-sm font-medium">{t("qualities.view.tradeoffs")}</h2>
        <span className="text-xs text-muted-foreground">
          {t("qualities.view.tradeoffs_subtitle")}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {tradeoffs.map((tradeoff) => {
          const target = tradeoff.quality_slug
            ? bySlug.get(tradeoff.quality_slug)
            : undefined;
          const badge = (
            <Badge variant="warning" className="shrink-0">
              {tradeoff.title}
            </Badge>
          );
          return (
            <div
              key={tradeoff.title}
              className="flex items-start gap-3 rounded-xl border bg-card p-3"
            >
              {target ? (
                <Link
                  to="/qualities/$id"
                  params={{ id: target.id }}
                  className="shrink-0"
                >
                  {badge}
                </Link>
              ) : (
                badge
              )}
              <p className="text-sm text-muted-foreground">{tradeoff.note}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Sibling qualities in tension/relation, resolved from slugs client-side. */
function RelatedQualities({ slugs }: { slugs: string[] }) {
  const { t } = useTranslation();
  const { data } = useArchitectureQualitiesQuery({});

  const bySlug = new Map((data?.items ?? []).map((x) => [x.slug, x]));
  const qualities = slugs
    .map((slug) => bySlug.get(slug))
    .filter((x) => x !== undefined);
  if (qualities.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">
        {t("qualities.view.related_qualities")}
      </h2>
      <div className="flex flex-wrap gap-2">
        {qualities.map((quality) => (
          <Link
            key={quality.id}
            to="/qualities/$id"
            params={{ id: quality.id }}
            className="rounded-lg border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted/50"
          >
            {quality.name}
          </Link>
        ))}
      </div>
    </section>
  );
}
