import { getRouteApi, Link } from "@tanstack/react-router";
import { CheckIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTechnologyCorpusQuery } from "@/features/technologies";
import { type ModellingStrategy, useModellingStrategiesQuery } from "../api";
import { COMPLEXITY_BADGE_VARIANT } from "../schemas";

const route = getRouteApi("/data/compare");
const SLOTS = [0, 1, 2] as const;

/** One comparison row with a shared label; children rendered per column. */
function Row({
  label,
  columns,
}: {
  label: string;
  columns: React.ReactNode[];
}) {
  return (
    <>
      <div className="col-span-full border-t pt-3 text-xs font-medium text-muted-foreground first:border-t-0">
        {label}
      </div>
      {columns.map((content, index) => (
        <div key={SLOTS[index]} className="min-w-0 pb-3">
          {content}
        </div>
      ))}
    </>
  );
}

/** Side-by-side comparison of two or three strategies from one topic. */
export function ModellingComparePage() {
  const { t } = useTranslation();
  const { topic, ids } = route.useSearch();
  const navigate = route.useNavigate();
  const { data, isPending } = useModellingStrategiesQuery({ topic });
  const { data: corpus } = useTechnologyCorpusQuery();

  if (isPending) return <Skeleton className="h-[70vh] w-full" />;

  const strategies = data?.items ?? [];
  const techNameBySlug = new Map((corpus ?? []).map((x) => [x.slug, x.name]));
  const selected = (ids ?? [])
    .map((id) => strategies.find((x) => x.id === id))
    .filter((x): x is ModellingStrategy => Boolean(x));
  const setSlot = (slot: number, id: string | null) => {
    const next: (string | undefined)[] = [...(ids ?? [])];
    next[slot] = id ?? undefined;
    navigate({
      search: { topic, ids: next.filter((x): x is string => Boolean(x)) },
      replace: true,
    });
  };

  const items = [
    { value: null, label: t("modelling.compare.slot_empty") },
    ...strategies.map((x) => ({ value: x.id, label: x.name })),
  ];
  const cols = selected.length || 1;
  const gridCols =
    cols >= 3 ? "lg:grid-cols-3" : cols === 2 ? "lg:grid-cols-2" : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {SLOTS.map((slot) => (
          <Select
            key={slot}
            items={items}
            value={(ids ?? [])[slot] ?? null}
            onValueChange={(value) => setSlot(slot, value)}
          >
            <SelectTrigger className="min-w-56 bg-background">
              <SelectValue
                placeholder={t("modelling.compare.slot_placeholder", {
                  n: slot + 1,
                })}
              />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.label} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>

      {selected.length < 2 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {t("modelling.compare.pick_two")}
        </p>
      ) : (
        <div
          className={`grid grid-cols-1 gap-x-6 rounded-xl border bg-card p-4 md:p-6 ${gridCols}`}
        >
          <Row
            label={t("modelling.compare.row_strategy")}
            columns={selected.map((x) => (
              <div key={x.id} className="flex flex-col gap-1.5">
                <Link
                  to="/data/$id"
                  params={{ id: x.id }}
                  className="font-medium text-primary hover:underline"
                >
                  {x.name}
                </Link>
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {x.description}
                </p>
              </div>
            ))}
          />
          <Row
            label={t("modelling.compare.row_family")}
            columns={selected.map((x) => (
              <Badge key={x.id} variant="accent">
                {t(`modelling.family.${x.family}`)}
              </Badge>
            ))}
          />
          <Row
            label={t("modelling.compare.row_complexity")}
            columns={selected.map((x) => (
              <Badge
                key={x.id}
                variant={COMPLEXITY_BADGE_VARIANT[x.complexity]}
              >
                {t(`modelling.complexity.${x.complexity}`)}
              </Badge>
            ))}
          />
          <Row
            label={t("modelling.compare.row_best_for")}
            columns={selected.map((x) => (
              <p key={x.id} className="text-sm">
                {x.best_for || "—"}
              </p>
            ))}
          />
          <Row
            label={t("modelling.compare.row_pros")}
            columns={selected.map((x) => (
              <ul key={x.id} className="flex flex-col gap-1.5">
                {x.pros.map((pro) => (
                  <li key={pro} className="flex items-start gap-2 text-sm">
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" />
                    {pro}
                  </li>
                ))}
              </ul>
            ))}
          />
          <Row
            label={t("modelling.compare.row_cons")}
            columns={selected.map((x) => (
              <ul key={x.id} className="flex flex-col gap-1.5">
                {x.cons.map((con) => (
                  <li key={con} className="flex items-start gap-2 text-sm">
                    <XIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                    {con}
                  </li>
                ))}
              </ul>
            ))}
          />
          <Row
            label={t("modelling.compare.row_origin")}
            columns={selected.map((x) => (
              <p key={x.id} className="text-sm text-muted-foreground">
                {[x.origin_year, x.originator].filter(Boolean).join(" · ") ||
                  "—"}
              </p>
            ))}
          />
          <Row
            label={t("modelling.compare.row_related")}
            columns={selected.map((x) => (
              <div key={x.id} className="flex flex-wrap gap-1.5">
                {x.related_technology_slugs.length > 0
                  ? x.related_technology_slugs.map((slug) => (
                      <Badge key={slug} variant="outline">
                        {techNameBySlug.get(slug) ?? slug}
                      </Badge>
                    ))
                  : "—"}
              </div>
            ))}
          />
        </div>
      )}
    </div>
  );
}
