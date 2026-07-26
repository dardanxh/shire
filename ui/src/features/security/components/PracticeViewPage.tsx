import { getRouteApi, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDataRegulationsQuery,
  useDataSafetyPracticeQuery,
  useDataSafetyPracticesQuery,
} from "../api";
import {
  artAnchor,
  COMPLEXITY_BADGE_VARIANT,
  type UnitLabel,
  unitRef,
} from "../schemas";

const route = getRouteApi("/security/practices/$id");

export function PracticeViewPage() {
  const { t } = useTranslation();
  const { id } = route.useParams();

  const { data: practice, isPending } = useDataSafetyPracticeQuery(id);
  const { data: regulations } = useDataRegulationsQuery({});

  if (isPending || !practice) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    );
  }

  // Client-side slug resolution — unresolved slugs are silently dropped.
  const regulationBySlug = new Map(
    (regulations?.items ?? []).map((x) => [x.slug, x]),
  );
  const satisfies = practice.satisfies
    .map((entry) => ({
      entry,
      regulation: regulationBySlug.get(entry.regulation_slug),
    }))
    .filter((x) => x.regulation !== undefined);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold">{practice.name}</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="accent">
            {t(`security.practice_category.${practice.category}`)}
          </Badge>
          <Badge variant={COMPLEXITY_BADGE_VARIANT[practice.complexity]}>
            {t(`security.complexity.${practice.complexity}`)}
          </Badge>
        </div>
      </div>

      {practice.objective && (
        <div className="rounded-xl bg-muted/50 px-4 py-3 text-sm">
          <span className="font-medium">
            {t("security.practice.objective")}:{" "}
          </span>
          {practice.objective}
        </div>
      )}

      {practice.description && (
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {practice.description}
        </p>
      )}

      {practice.implementation_steps.length > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border p-4 md:p-6">
          <h2 className="text-sm font-medium">
            {t("security.practice.implementation_steps")}
          </h2>
          <ol className="flex flex-col gap-2.5">
            {practice.implementation_steps.map((step, index) => (
              <li key={step} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-xs text-primary">
                  {index + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {satisfies.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">
            {t("security.practice.satisfies")}
          </h2>
          <div className="flex flex-col gap-3">
            {satisfies.map(({ entry, regulation }) =>
              regulation ? (
                <Card key={entry.regulation_slug} className="gap-0">
                  <CardContent className="flex flex-col gap-2 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to="/security/regulations/$id"
                        params={{ id: regulation.id }}
                        className="font-medium text-sm hover:underline"
                      >
                        {regulation.name}
                      </Link>
                      <div className="flex flex-wrap gap-1.5">
                        {(entry.article_refs ?? []).map((ref) => (
                          <Link
                            key={ref}
                            to="/security/regulations/$id"
                            params={{ id: regulation.id }}
                            hash={artAnchor(ref)}
                            className="rounded-md border bg-card px-2 py-0.5 font-mono text-xs transition-colors hover:bg-muted"
                          >
                            {unitRef(regulation.unit_label as UnitLabel, ref)}
                          </Link>
                        ))}
                      </div>
                    </div>
                    {entry.note && (
                      <p className="text-xs text-muted-foreground">
                        {entry.note}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ) : null,
            )}
          </div>
        </section>
      )}

      <RelatedPracticeChips slugs={practice.related_practice_slugs} />
    </div>
  );
}

/** Sibling practices, resolved from slugs client-side. */
function RelatedPracticeChips({ slugs }: { slugs: string[] }) {
  const { t } = useTranslation();
  const { data: practices } = useDataSafetyPracticesQuery({});
  const bySlug = new Map((practices?.items ?? []).map((x) => [x.slug, x]));
  const resolved = slugs
    .map((slug) => bySlug.get(slug))
    .filter((x) => x !== undefined);
  if (resolved.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">
        {t("security.practice.related_practices")}
      </h2>
      <div className="flex flex-wrap gap-2">
        {resolved.map((practice) => (
          <Link
            key={practice.id}
            to="/security/practices/$id"
            params={{ id: practice.id }}
            className="rounded-lg border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted/50"
          >
            {practice.name}
          </Link>
        ))}
      </div>
    </section>
  );
}
