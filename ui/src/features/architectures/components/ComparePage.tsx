import { getRouteApi, Link } from "@tanstack/react-router";
import { ChevronLeftIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MermaidDiagram } from "@/components/shared/MermaidDiagram";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { type Blueprint, useBlueprintsQuery } from "../api";
import { LIST_SEARCH } from "../keys";

const route = getRouteApi("/architectures/compare");
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

/** Side-by-side comparison of two or three architectures. */
export function ComparePage() {
  const { t } = useTranslation();
  const { ids } = route.useSearch();
  const navigate = route.useNavigate();
  const { data: all, isPending } = useBlueprintsQuery({});

  if (isPending) return <Skeleton className="h-[70vh] w-full" />;

  const blueprints = all ?? [];
  const selected = (ids ?? [])
    .map((id) => blueprints.find((b) => b.id === id))
    .filter((b): b is Blueprint => Boolean(b));
  const setSlot = (slot: number, id: string | null) => {
    const next: (string | undefined)[] = [...(ids ?? [])];
    next[slot] = id ?? undefined;
    navigate({
      search: { ids: next.filter((x): x is string => Boolean(x)) },
      replace: true,
    });
  };

  const items = [
    { value: null, label: t("blueprints.compare.slot_empty") },
    ...blueprints.map((b) => ({ value: b.id, label: b.name })),
  ];
  const cols = selected.length || 1;
  const gridCols =
    cols >= 3 ? "lg:grid-cols-3" : cols === 2 ? "lg:grid-cols-2" : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          render={<Link to="/architectures" search={LIST_SEARCH} />}
        >
          <ChevronLeftIcon />
          {t("blueprints.compare.back")}
        </Button>
        <h1 className="font-heading text-xl font-semibold">
          {t("blueprints.compare.title")}
        </h1>
      </div>

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
                placeholder={t("blueprints.compare.slot_placeholder", {
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
            {t("blueprints.compare.pick_two")}
          </p>
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 gap-x-6 gap-y-1 rounded-xl border bg-card p-4 ${gridCols}`}
        >
          <Row
            label={t("blueprints.compare.row_architecture")}
            columns={selected.map((b) => (
              <div key={b.id} className="flex flex-col gap-1">
                <Link
                  to="/architectures/$id"
                  params={{ id: b.id }}
                  className="font-medium text-primary hover:underline"
                >
                  {b.name}
                </Link>
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {b.description}
                </p>
              </div>
            ))}
          />
          <Row
            label={t("blueprints.compare.row_diagram")}
            columns={selected.map((b) => {
              const conceptual = b.diagrams.find(
                (d) => d.kind === "conceptual",
              );
              return conceptual ? (
                <div
                  key={b.id}
                  className="max-h-56 overflow-hidden rounded-lg border bg-white p-2"
                >
                  <MermaidDiagram source={conceptual.mermaid} />
                </div>
              ) : (
                <span key={b.id} className="text-sm text-muted-foreground">
                  {t("blueprints.view.none")}
                </span>
              );
            })}
          />
          <Row
            label={t("blueprints.compare.row_complexity")}
            columns={selected.map((b) => (
              <Badge key={b.id} variant="secondary">
                {t(`blueprints.complexity.${b.complexity}`, {
                  defaultValue: b.complexity,
                })}
              </Badge>
            ))}
          />
          <Row
            label={t("blueprints.view.use_cases")}
            columns={selected.map((b) => (
              <div key={b.id} className="flex flex-wrap gap-1">
                {b.use_cases.map((slug) => (
                  <Badge key={slug} variant="outline">
                    {t(`blueprints.use_case_tags.${slug}`, {
                      defaultValue: slug,
                    })}
                  </Badge>
                ))}
              </div>
            ))}
          />
          <Row
            label={t("blueprints.view.when_to_use")}
            columns={selected.map((b) => (
              <ul
                key={b.id}
                className="flex list-disc flex-col gap-1 pl-4 text-sm text-muted-foreground"
              >
                {b.when_to_use.slice(0, 3).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ))}
          />
          <Row
            label={t("blueprints.view.hot_spots")}
            columns={selected.map((b) => (
              <ul key={b.id} className="flex flex-col gap-1.5 text-sm">
                {b.hot_spots.slice(0, 3).map((spot) => (
                  <li key={spot.title} className="flex items-start gap-1.5">
                    <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {spot.title}
                      </span>{" "}
                      — {spot.detail}
                    </span>
                  </li>
                ))}
              </ul>
            ))}
          />
          <Row
            label={t("blueprints.compare.row_stages")}
            columns={selected.map((b) => (
              <span key={b.id} className="text-sm text-muted-foreground">
                {b.stages.map((stage) => stage.name).join(" → ")}
              </span>
            ))}
          />
          <Row
            label={t("blueprints.view.evolution")}
            columns={selected.map((b) => (
              <ul
                key={b.id}
                className="flex flex-col gap-1 text-sm text-muted-foreground"
              >
                {b.evolution.length > 0
                  ? b.evolution.map((edge) => {
                      const target = blueprints.find(
                        (x) => x.slug === edge.to_slug,
                      );
                      return (
                        <li key={edge.to_slug}>
                          → {target?.name ?? edge.to_slug}
                        </li>
                      );
                    })
                  : t("blueprints.view.none")}
              </ul>
            ))}
          />
        </div>
      )}
    </div>
  );
}
