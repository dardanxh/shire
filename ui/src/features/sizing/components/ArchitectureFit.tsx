import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { useBlueprintsQuery } from "@/features/architectures";
import { useArchitectureQualitiesQuery } from "@/features/qualities";
import type { SizingResults } from "../calc";

/** Regime badge + chips linking to matching architecture blueprints and qualities. */
export function ArchitectureFit({ fit }: { fit: SizingResults["fit"] }) {
  const { t } = useTranslation();
  const { data: blueprints } = useBlueprintsQuery({});
  const { data: qualities } = useArchitectureQualitiesQuery({});

  // Client-side slug resolution — unresolved slugs are silently dropped.
  const blueprintBySlug = new Map((blueprints ?? []).map((b) => [b.slug, b]));
  const qualityBySlug = new Map(
    (qualities?.items ?? []).map((q) => [q.slug, q]),
  );
  const matchedBlueprints = fit.blueprintSlugs
    .map((slug) => blueprintBySlug.get(slug))
    .filter((x) => x !== undefined);
  const matchedQualities = fit.qualitySlugs
    .map((slug) => qualityBySlug.get(slug))
    .filter((x) => x !== undefined);

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">{t("sizing.fit.title")}</h3>
        <Badge variant="accent">
          {t("sizing.fit.regime_label")}: {t(`sizing.fit.regime.${fit.regime}`)}
        </Badge>
      </div>

      {matchedBlueprints.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">
            {t("sizing.fit.blueprints")}
          </span>
          <div className="flex flex-wrap gap-2">
            {matchedBlueprints.map((blueprint) => (
              <Link
                key={blueprint.id}
                to="/architectures/$id"
                params={{ id: blueprint.id }}
                className="rounded-lg border bg-background px-2.5 py-1 text-sm transition-colors hover:bg-muted/50"
              >
                {blueprint.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {matchedQualities.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">
            {t("sizing.fit.qualities")}
          </span>
          <div className="flex flex-wrap gap-2">
            {matchedQualities.map((quality) => (
              <Link
                key={quality.id}
                to="/qualities/$id"
                params={{ id: quality.id }}
                className="rounded-lg border bg-background px-2.5 py-1 text-sm transition-colors hover:bg-muted/50"
              >
                {quality.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
