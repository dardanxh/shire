import { getRouteApi, Link } from "@tanstack/react-router";
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
import { type Technology, useInfiniteTechnologiesQuery } from "../api";
import { MATURITY_BADGE_VARIANT } from "./TechnologyCard";

const route = getRouteApi("/technologies/compare");
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

/** Side-by-side comparison of two or three technologies. */
export function TechnologiesComparePage() {
  const { t } = useTranslation();
  const { ids } = route.useSearch();
  const navigate = route.useNavigate();
  // The corpus is 395 rows — fetch enough pages for the pickers via the infinite query's first page size.
  const { data, isPending } = useInfiniteTechnologiesQuery({});

  if (isPending) return <Skeleton className="h-[70vh] w-full" />;

  const technologies = data?.pages.flatMap((page) => page.items) ?? [];
  const selected = (ids ?? [])
    .map((id) => technologies.find((x) => x.id === id))
    .filter((x): x is Technology => Boolean(x));
  const setSlot = (slot: number, id: string | null) => {
    const next: (string | undefined)[] = [...(ids ?? [])];
    next[slot] = id ?? undefined;
    navigate({
      search: { ids: next.filter((x): x is string => Boolean(x)) },
      replace: true,
    });
  };

  const items = [
    { value: null, label: t("technologies.compare.slot_empty") },
    ...technologies.map((x) => ({ value: x.id, label: x.name })),
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
                placeholder={t("technologies.compare.slot_placeholder", {
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
        <div className="grid min-h-[40vh] place-items-center rounded-xl border">
          <p className="text-sm text-muted-foreground">
            {t("technologies.compare.pick_two")}
          </p>
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 gap-x-6 gap-y-1 rounded-xl border bg-card p-4 ${gridCols}`}
        >
          <Row
            label={t("technologies.compare.row_technology")}
            columns={selected.map((x) => (
              <div key={x.id} className="flex flex-col gap-1">
                <Link
                  to="/technologies/$id"
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
            label={t("technologies.compare.row_maturity")}
            columns={selected.map((x) => (
              <Badge key={x.id} variant={MATURITY_BADGE_VARIANT[x.maturity]}>
                {t(`technologies.maturity.${x.maturity}`)}
              </Badge>
            ))}
          />
          <Row
            label={t("technologies.compare.row_license")}
            columns={selected.map((x) => (
              <div key={x.id} className="flex flex-wrap items-center gap-1.5">
                {x.oss && (
                  <Badge variant="accent">{t("technologies.oss.yes")}</Badge>
                )}
                <Badge variant="outline">
                  {t(`technologies.adoption.cost_${x.cost_model}`)}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {t(`technologies.adoption.tier_${x.cost_tier}`)}
                </span>
              </div>
            ))}
          />
          <Row
            label={t("technologies.compare.row_curve")}
            columns={selected.map((x) => (
              <span key={x.id} className="text-sm text-muted-foreground">
                {t(`technologies.adoption.curve_${x.learning_curve}`)}
              </span>
            ))}
          />
          <Row
            label={t("technologies.compare.row_ttw")}
            columns={selected.map((x) => (
              <span key={x.id} className="text-sm text-muted-foreground">
                {t(`technologies.adoption.ttw_${x.time_to_win}`)}
              </span>
            ))}
          />
          <Row
            label={t("technologies.compare.row_deployments")}
            columns={selected.map((x) => (
              <div key={x.id} className="flex flex-wrap gap-1">
                {x.deployment_models.map((model) => (
                  <Badge key={model} variant="outline">
                    {t(`technologies.deployment.${model}`)}
                  </Badge>
                ))}
              </div>
            ))}
          />
        </div>
      )}
    </div>
  );
}
