import { getRouteApi, Link } from "@tanstack/react-router";
import {
  PlusIcon,
  ScaleIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CardColumnsSelect,
  useCardColumns,
} from "@/components/shared/CardColumns";
import { SortMenu } from "@/components/shared/SortMenu";
import { StarredFilterButton } from "@/components/shared/StarredFilter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useModellingStrategiesQuery } from "../api";
import { COMPLEXITIES, FAMILIES_BY_TOPIC, TOPICS } from "../schemas";
import { ModellingStrategyCard } from "./ModellingStrategyCard";

const route = getRouteApi("/data/");

const COMPLEXITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

function sortStrategies<
  T extends { name: string; complexity: string; origin_year: number | null },
>(items: T[], sortBy: string): T[] {
  if (sortBy === "name")
    return [...items].sort((a, b) => a.name.localeCompare(b.name));
  if (sortBy === "complexity")
    return [...items].sort(
      (a, b) =>
        (COMPLEXITY_RANK[a.complexity] ?? 3) -
        (COMPLEXITY_RANK[b.complexity] ?? 3),
    );
  if (sortBy === "origin_year")
    return [...items].sort(
      (a, b) => (a.origin_year ?? 9999) - (b.origin_year ?? 9999),
    );
  return items;
}

export function ModellingStrategiesListPage() {
  const { t } = useTranslation();
  const [gridClass, columns, setColumns] = useCardColumns();
  const [sortBy, setSortBy] = useState<string>("default");
  const navigate = route.useNavigate();
  const search = route.useSearch();

  const tabFamilies = FAMILIES_BY_TOPIC[search.tab];
  // A URL family from the other tab is ignored rather than rendering an empty grid.
  const family =
    search.family && tabFamilies.includes(search.family)
      ? search.family
      : undefined;

  const { data, isPending, isError, refetch } = useModellingStrategiesQuery({
    topic: search.tab,
    q: search.q,
    family,
    complexity: search.complexity,
    starred: search.starred ? true : undefined,
  });
  const strategies = data?.items ?? [];

  // Strategies ticked for comparison (max 3) — transient UI state.
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const toggleCompare = (id: string) =>
    setCompareIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= 3
          ? prev
          : [...prev, id],
    );

  // Local mirror of `q` so typing stays responsive while the URL update is debounced.
  const [searchInput, setSearchInput] = useState(search.q ?? "");
  const searchTimer = useRef<number | undefined>(undefined);
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchInput(value);
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      navigate({
        search: (prev) => ({ ...prev, q: value || undefined }),
        replace: true,
      });
    }, 300);
  };

  const switchTab = (tab: (typeof TOPICS)[number]) => {
    window.clearTimeout(searchTimer.current);
    setSearchInput("");
    setCompareIds([]); // a comparison never spans tabs
    navigate({ search: { tab } }); // switching tabs resets all filters
  };

  const hasFilters = Boolean(search.q || family || search.complexity);
  const clearFilters = () => {
    window.clearTimeout(searchTimer.current);
    setSearchInput("");
    navigate({ search: { tab: search.tab } });
  };

  const familyItems = [
    { value: null, label: t("modelling.list.family_all") },
    ...tabFamilies.map((f) => ({
      value: f,
      label: t(`modelling.family.${f}`),
    })),
  ];
  const complexityItems = [
    { value: null, label: t("modelling.list.complexity_all") },
    ...COMPLEXITIES.map((complexity) => ({
      value: complexity,
      label: t(`modelling.complexity.${complexity}`),
    })),
  ];

  // Active select-filters as removable chips (q stays visible in the search box).
  type FilterKey = "family" | "complexity";
  const dropFilter = (key: FilterKey) =>
    navigate({ search: (prev) => ({ ...prev, [key]: undefined }) });
  const activeFilters: { key: FilterKey; label: string }[] = [];
  if (family)
    activeFilters.push({
      key: "family",
      label: t(`modelling.family.${family}`),
    });
  if (search.complexity)
    activeFilters.push({
      key: "complexity",
      label: t(`modelling.complexity.${search.complexity}`),
    });

  // One flat grid in the declared FAMILIES_BY_TOPIC order (server sorts by
  // family alphabetically) — the family select covers per-category browsing.
  const ordered = tabFamilies.flatMap((f) =>
    strategies.filter((s) => s.family === f),
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Tabs left, page action right — same header row as technologies. */}
      <div className="flex flex-wrap items-end justify-between gap-2 border-b">
        <div className="flex items-center gap-1">
          {TOPICS.map((topic) => (
            <button
              key={topic}
              type="button"
              onClick={() => switchTab(topic)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                search.tab === topic
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`modelling.topic.${topic}`)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Button
            size="sm"
            variant={compareIds.length >= 2 ? "default" : "outline"}
            render={
              <Link
                to="/data/compare"
                search={{ topic: search.tab, ids: compareIds }}
              />
            }
          >
            <ScaleIcon />
            {compareIds.length > 0
              ? t("modelling.list.compare_count", { count: compareIds.length })
              : t("modelling.list.compare_button")}
          </Button>
          <Button
            size="sm"
            render={<Link to="/data/new" search={{ topic: search.tab }} />}
          >
            <PlusIcon />
            {t("modelling.list.new_button")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={handleSearchChange}
            placeholder={t("modelling.list.search_placeholder")}
            className="bg-background pl-8"
          />
        </div>
        <CardColumnsSelect
          columns={columns}
          onChange={setColumns}
          label={t("common.cards.per_row")}
          autoLabel={t("common.cards.auto")}
        />
        <SortMenu
          label={t("common.sort.label")}
          value={sortBy}
          onChange={setSortBy}
          options={[
            { value: "default", label: t("common.sort.default") },
            { value: "name", label: t("common.sort.name") },
            { value: "complexity", label: t("common.sort.complexity") },
            { value: "origin_year", label: t("common.sort.origin_year") },
          ]}
        />
        <StarredFilterButton
          active={Boolean(search.starred)}
          label={t("common.filters.starred")}
          onToggle={() =>
            navigate({
              search: (prev) => ({
                ...prev,
                starred: prev.starred ? undefined : true,
              }),
            })
          }
        />
        <Popover>
          <PopoverTrigger
            render={<Button variant="outline" className="bg-background" />}
          >
            <SlidersHorizontalIcon />
            {t("modelling.list.filters")}
            {activeFilters.length > 0 && (
              <Badge variant="accent">{activeFilters.length}</Badge>
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="gap-3 p-3">
            <FilterField label={t("modelling.list.filter_family")}>
              <Select
                items={familyItems}
                value={family ?? null}
                onValueChange={(value) =>
                  navigate({
                    search: (prev) => ({ ...prev, family: value ?? undefined }),
                  })
                }
              >
                <SelectTrigger className="w-full bg-background">
                  <SelectValue placeholder={t("modelling.list.family_all")} />
                </SelectTrigger>
                <SelectContent>
                  {familyItems.map((item) => (
                    <SelectItem key={item.label} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label={t("modelling.list.filter_complexity")}>
              <Select
                items={complexityItems}
                value={search.complexity ?? null}
                onValueChange={(value) =>
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      complexity: value ?? undefined,
                    }),
                  })
                }
              >
                <SelectTrigger className="w-full bg-background">
                  <SelectValue
                    placeholder={t("modelling.list.complexity_all")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {complexityItems.map((item) => (
                    <SelectItem key={item.label} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          </PopoverContent>
        </Popover>
        {data && (
          <p className="ml-auto text-xs text-muted-foreground">
            {t("modelling.list.count", {
              filtered: data.total,
              total: data.total,
            })}
          </p>
        )}
      </div>

      {/* Active filters as removable chips, tucked under the toolbar. */}
      {hasFilters && (
        <div className="-mt-3 flex flex-wrap items-center gap-1.5">
          {activeFilters.map((filter) => (
            <Badge key={filter.key} variant="accent" className="gap-0.5 pr-1">
              {filter.label}
              <button
                type="button"
                onClick={() => dropFilter(filter.key)}
                aria-label={t("modelling.list.remove_filter", {
                  name: filter.label,
                })}
                className="rounded-full p-0.5 text-accent-foreground/50 transition-colors hover:bg-accent-foreground/10 hover:text-accent-foreground"
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {t("common.actions.clear_filters")}
          </Button>
        </div>
      )}

      {isError ? (
        <div className="grid min-h-[30vh] place-items-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              {t("common.table.error")}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              {t("common.actions.retry")}
            </Button>
          </div>
        </div>
      ) : isPending ? (
        <div className={gridClass}>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={`sk-${index}`} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : strategies.length === 0 ? (
        <div className="grid min-h-[30vh] place-items-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="font-medium">{t("modelling.list.empty_title")}</p>
            <p className="text-sm text-muted-foreground">
              {t("modelling.list.empty_description")}
            </p>
          </div>
        </div>
      ) : (
        <div className={gridClass}>
          {sortStrategies(ordered, sortBy).map((strategy) => (
            <ModellingStrategyCard
              key={strategy.id}
              strategy={strategy}
              selected={compareIds.includes(strategy.id)}
              selectionActive={compareIds.length > 0}
              selectionFull={compareIds.length >= 3}
              onToggleSelect={() => toggleCompare(strategy.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** One labeled control row inside the Filters popover. */
function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
