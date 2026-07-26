import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/skeleton";
import { useBlueprintsQuery } from "@/features/architectures";
import { useArchitectureQualitiesQuery } from "../api";
import {
  QUALITY_CATEGORIES,
  QUALITY_RATINGS,
  type QualityRating,
  RATING_CELL_COLOR,
} from "../schemas";

/**
 * Qualities × architectures heatmap. Rows are qualities grouped by category, columns are
 * the architecture blueprints; each cell is colored by the manifestation rating (empty =
 * not notable). The first column and header row stick while the grid scrolls sideways.
 */
export function QualityMatrix() {
  const { t } = useTranslation();
  const { data: qData, isPending: qPending } = useArchitectureQualitiesQuery(
    {},
  );
  const { data: blueprints, isPending: bPending } = useBlueprintsQuery({});

  if (qPending || bPending || !qData || !blueprints) {
    return <Skeleton className="h-96 rounded-xl" />;
  }

  const qualities = qData.items;
  const columns = [...blueprints].sort((a, b) => a.name.localeCompare(b.name));

  // cellMap: `${qualitySlug}|${blueprintSlug}` -> {rating, statement}.
  const cellMap = new Map<
    string,
    { rating: QualityRating; statement: string }
  >();
  for (const quality of qualities) {
    for (const m of quality.manifestations) {
      cellMap.set(`${quality.slug}|${m.blueprint_slug}`, {
        rating: m.rating,
        statement: m.statement,
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-xs font-medium text-muted-foreground">
          {t("qualities.matrix.legend")}:
        </span>
        {QUALITY_RATINGS.map((rating) => (
          <span key={rating} className="flex items-center gap-1.5 text-xs">
            <span
              className="size-3 rounded-sm"
              style={{ backgroundColor: RATING_CELL_COLOR[rating] }}
            />
            {t(`qualities.rating.${rating}`)}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-3 rounded-sm bg-muted" />
          {t("qualities.matrix.empty_note")}
        </span>
      </div>

      <p className="text-xs text-muted-foreground lg:hidden">
        {t("qualities.matrix.mobile_hint")}
      </p>

      <div className="overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <table className="min-w-max border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 border-b border-r bg-background p-2 text-left align-bottom" />
                {columns.map((blueprint) => (
                  <th
                    key={blueprint.id}
                    className="sticky top-0 z-10 h-36 border-b bg-background p-1 align-bottom"
                  >
                    <Link
                      to="/architectures/$id"
                      params={{ id: blueprint.id }}
                      title={blueprint.name}
                      className="mx-auto block w-6 whitespace-nowrap text-xs text-muted-foreground hover:text-foreground hover:underline"
                      style={{
                        writingMode: "vertical-rl",
                        transform: "rotate(180deg)",
                      }}
                    >
                      {blueprint.name}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {QUALITY_CATEGORIES.flatMap((category) => {
                const group = qualities.filter((q) => q.category === category);
                if (group.length === 0) return [];
                return [
                  <tr key={`cat-${category}`}>
                    <th
                      colSpan={columns.length + 1}
                      className="sticky left-0 z-10 border-b bg-muted/40 px-2 py-1 text-left text-xs font-medium text-muted-foreground"
                    >
                      {t(`qualities.category.${category}`)}
                    </th>
                  </tr>,
                  ...group.map((quality) => (
                    <tr key={quality.id} className="group">
                      <th className="sticky left-0 z-10 border-b border-r bg-background px-2 py-1 text-left font-normal group-hover:bg-muted/40">
                        <Link
                          to="/qualities/$id"
                          params={{ id: quality.id }}
                          className="whitespace-nowrap text-sm hover:underline"
                        >
                          {quality.name}
                        </Link>
                      </th>
                      {columns.map((blueprint) => {
                        const cell = cellMap.get(
                          `${quality.slug}|${blueprint.slug}`,
                        );
                        return (
                          <td
                            key={blueprint.id}
                            className="border-b p-0.5 text-center group-hover:bg-muted/20"
                          >
                            {cell ? (
                              <Link
                                to="/qualities/$id"
                                params={{ id: quality.id }}
                                title={`${quality.name} · ${blueprint.name} — ${t(`qualities.rating.${cell.rating}`)}: ${cell.statement}`}
                                className="mx-auto block size-6 rounded-sm ring-inset transition-all hover:ring-2 hover:ring-foreground/40"
                                style={{
                                  backgroundColor:
                                    RATING_CELL_COLOR[cell.rating],
                                }}
                              />
                            ) : (
                              <span className="mx-auto block size-6 rounded-sm bg-muted/20" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
