import { getRouteApi } from "@tanstack/react-router";
import { SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
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
import { useDataRegulationsQuery, useDataSafetyPracticesQuery } from "../api";
import {
  COMPLEXITIES,
  PRACTICE_CATEGORIES,
  type PracticeCategory,
  REGIONS,
  REGULATION_CATEGORIES,
  type RegulationCategory,
  SECURITY_TABS,
  type SecurityTab,
} from "../schemas";
import { PracticeCard } from "./PracticeCard";
import { RegulationCard } from "./RegulationCard";

const route = getRouteApi("/security/");

function sortByName<T extends { name: string }>(
  items: T[],
  sortBy: string,
): T[] {
  return sortBy === "name"
    ? [...items].sort((a, b) => a.name.localeCompare(b.name))
    : items;
}

export function SecurityListPage() {
  const { t } = useTranslation();
  const [gridClass, columns, setColumns] = useCardColumns();
  const [sortBy, setSortBy] = useState<string>("default");
  const navigate = route.useNavigate();
  const search = route.useSearch();

  // The URL `category` is shared by both tabs; a value from the other tab's enum
  // is ignored rather than rendering an empty grid.
  const regulationCategory =
    search.tab === "regulations" &&
    search.category &&
    (REGULATION_CATEGORIES as readonly string[]).includes(search.category)
      ? (search.category as RegulationCategory)
      : undefined;
  const practiceCategory =
    search.tab === "practices" &&
    search.category &&
    (PRACTICE_CATEGORIES as readonly string[]).includes(search.category)
      ? (search.category as PracticeCategory)
      : undefined;

  const regulationsQuery = useDataRegulationsQuery({
    q: search.tab === "regulations" ? search.q : undefined,
    category: regulationCategory,
    region: search.tab === "regulations" ? search.region : undefined,
    starred: search.tab === "regulations" && search.starred ? true : undefined,
  });
  const practicesQuery = useDataSafetyPracticesQuery({
    q: search.tab === "practices" ? search.q : undefined,
    category: practiceCategory,
    complexity: search.tab === "practices" ? search.complexity : undefined,
    starred: search.tab === "practices" && search.starred ? true : undefined,
  });
  const active =
    search.tab === "regulations" ? regulationsQuery : practicesQuery;

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

  const switchTab = (tab: SecurityTab) => {
    window.clearTimeout(searchTimer.current);
    setSearchInput("");
    navigate({ search: { tab } }); // switching tabs resets all filters
  };

  const hasFilters = Boolean(
    search.q || search.category || search.region || search.complexity,
  );
  const clearFilters = () => {
    window.clearTimeout(searchTimer.current);
    setSearchInput("");
    navigate({ search: { tab: search.tab } });
  };

  const categoryItems =
    search.tab === "regulations"
      ? [
          { value: null, label: t("security.list.all_categories") },
          ...REGULATION_CATEGORIES.map((category) => ({
            value: category as string,
            label: t(`security.category.${category}`),
          })),
        ]
      : [
          { value: null, label: t("security.list.all_categories") },
          ...PRACTICE_CATEGORIES.map((category) => ({
            value: category as string,
            label: t(`security.practice_category.${category}`),
          })),
        ];
  const regionItems = [
    { value: null, label: t("security.list.all_regions") },
    ...REGIONS.map((region) => ({
      value: region,
      label: t(`security.region.${region}`),
    })),
  ];
  const complexityItems = [
    { value: null, label: t("security.list.all_complexities") },
    ...COMPLEXITIES.map((complexity) => ({
      value: complexity,
      label: t(`security.complexity.${complexity}`),
    })),
  ];

  // Active select-filters as removable chips (q stays visible in the search box).
  type FilterKey = "category" | "region" | "complexity";
  const dropFilter = (key: FilterKey) =>
    navigate({ search: (prev) => ({ ...prev, [key]: undefined }) });
  const activeFilters: { key: FilterKey; label: string }[] = [];
  if (regulationCategory)
    activeFilters.push({
      key: "category",
      label: t(`security.category.${regulationCategory}`),
    });
  if (practiceCategory)
    activeFilters.push({
      key: "category",
      label: t(`security.practice_category.${practiceCategory}`),
    });
  if (search.tab === "regulations" && search.region)
    activeFilters.push({
      key: "region",
      label: t(`security.region.${search.region}`),
    });
  if (search.tab === "practices" && search.complexity)
    activeFilters.push({
      key: "complexity",
      label: t(`security.complexity.${search.complexity}`),
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b">
        <div className="flex items-center gap-1">
          {SECURITY_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => switchTab(tab)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                search.tab === tab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`security.tab.${tab}`)}
            </button>
          ))}
        </div>
        <p className="hidden pb-2 text-xs text-muted-foreground sm:block">
          {t("security.list.subtitle")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={handleSearchChange}
            placeholder={
              search.tab === "regulations"
                ? t("security.list.search_regulations_placeholder")
                : t("security.list.search_practices_placeholder")
            }
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
            {t("security.list.filters")}
            {activeFilters.length > 0 && (
              <Badge variant="accent">{activeFilters.length}</Badge>
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="gap-3 p-3">
            <FilterField label={t("security.list.filter_category")}>
              <Select
                items={categoryItems}
                value={
                  (regulationCategory ?? practiceCategory ?? null) as
                    | string
                    | null
                }
                onValueChange={(value) =>
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      category: (value ?? undefined) as
                        | RegulationCategory
                        | PracticeCategory
                        | undefined,
                    }),
                  })
                }
              >
                <SelectTrigger className="w-full bg-background">
                  <SelectValue
                    placeholder={t("security.list.all_categories")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {categoryItems.map((item) => (
                    <SelectItem key={item.label} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            {search.tab === "regulations" ? (
              <FilterField label={t("security.list.filter_region")}>
                <Select
                  items={regionItems}
                  value={search.region ?? null}
                  onValueChange={(value) =>
                    navigate({
                      search: (prev) => ({
                        ...prev,
                        region: value ?? undefined,
                      }),
                    })
                  }
                >
                  <SelectTrigger className="w-full bg-background">
                    <SelectValue placeholder={t("security.list.all_regions")} />
                  </SelectTrigger>
                  <SelectContent>
                    {regionItems.map((item) => (
                      <SelectItem key={item.label} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
            ) : (
              <FilterField label={t("security.list.filter_complexity")}>
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
                      placeholder={t("security.list.all_complexities")}
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
            )}
          </PopoverContent>
        </Popover>
        {active.data && (
          <p className="ml-auto text-xs text-muted-foreground">
            {search.tab === "regulations"
              ? t("security.list.regulation_count", {
                  count: active.data.total,
                })
              : t("security.list.practice_count", { count: active.data.total })}
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
                aria-label={t("security.list.remove_filter", {
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

      {active.isError ? (
        <div className="grid min-h-[30vh] place-items-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              {t("security.list.error")}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => active.refetch()}
            >
              {t("common.actions.retry")}
            </Button>
          </div>
        </div>
      ) : active.isPending ? (
        <div className={gridClass}>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={`sk-${index}`} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : (active.data?.items.length ?? 0) === 0 ? (
        <div className="grid min-h-[30vh] place-items-center">
          <p className="text-sm text-muted-foreground">
            {search.tab === "regulations"
              ? t("security.list.empty_regulations")
              : t("security.list.empty_practices")}
          </p>
        </div>
      ) : search.tab === "regulations" ? (
        <div className={gridClass}>
          {sortByName(regulationsQuery.data?.items ?? [], sortBy).map(
            (regulation) => (
              <RegulationCard key={regulation.id} regulation={regulation} />
            ),
          )}
        </div>
      ) : (
        <div className={gridClass}>
          {sortByName(practicesQuery.data?.items ?? [], sortBy).map(
            (practice) => (
              <PracticeCard key={practice.id} practice={practice} />
            ),
          )}
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
