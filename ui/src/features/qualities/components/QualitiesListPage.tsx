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
import { useArchitectureQualitiesQuery } from "../api";
import { QUALITY_CATEGORIES, QUALITY_TABS, type QualityTab } from "../schemas";
import { QualityCard } from "./QualityCard";
import { QualityMatrix } from "./QualityMatrix";

const route = getRouteApi("/qualities/");

function sortQualities<T extends { name: string; created_at: string }>(
  items: T[],
  sortBy: string,
): T[] {
  if (sortBy === "name")
    return [...items].sort((a, b) => a.name.localeCompare(b.name));
  if (sortBy === "newest")
    return [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return items;
}

export function QualitiesListPage() {
  const { t } = useTranslation();
  const [gridClass, columns, setColumns] = useCardColumns();
  const [sortBy, setSortBy] = useState<string>("default");
  const navigate = route.useNavigate();
  const search = route.useSearch();

  const { data, isPending, isError, refetch } = useArchitectureQualitiesQuery({
    q: search.tab === "catalog" ? search.q : undefined,
    category: search.tab === "catalog" ? search.category : undefined,
    starred: search.tab === "catalog" && search.starred ? true : undefined,
  });
  const qualities = data?.items ?? [];

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

  const switchTab = (tab: QualityTab) => {
    window.clearTimeout(searchTimer.current);
    setSearchInput("");
    navigate({ search: { tab } }); // switching tabs resets filters
  };

  const hasFilters = Boolean(search.q || search.category);
  const clearFilters = () => {
    window.clearTimeout(searchTimer.current);
    setSearchInput("");
    navigate({ search: { tab: search.tab } });
  };

  const categoryItems = [
    { value: null, label: t("qualities.list.all_categories") },
    ...QUALITY_CATEGORIES.map((category) => ({
      value: category,
      label: t(`qualities.category.${category}`),
    })),
  ];

  // Active select-filters as removable chips (q stays visible in the search box).
  const dropCategory = () =>
    navigate({ search: (prev) => ({ ...prev, category: undefined }) });
  const activeFilters: { key: "category"; label: string }[] = [];
  if (search.category)
    activeFilters.push({
      key: "category",
      label: t(`qualities.category.${search.category}`),
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b">
        <div className="flex items-center gap-1">
          {QUALITY_TABS.map((tab) => (
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
              {t(`qualities.tab.${tab}`)}
            </button>
          ))}
        </div>
        <p className="hidden pb-2 text-xs text-muted-foreground sm:block">
          {t("qualities.list.subtitle")}
        </p>
      </div>

      {search.tab === "matrix" ? (
        <QualityMatrix />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-xs">
              <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={handleSearchChange}
                placeholder={t("qualities.list.search_placeholder")}
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
                { value: "newest", label: t("common.sort.newest") },
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
                {t("qualities.list.filters")}
                {activeFilters.length > 0 && (
                  <Badge variant="accent">{activeFilters.length}</Badge>
                )}
              </PopoverTrigger>
              <PopoverContent align="start" className="gap-3 p-3">
                <FilterField label={t("qualities.list.filter_category")}>
                  <Select
                    items={categoryItems}
                    value={search.category ?? null}
                    onValueChange={(value) =>
                      navigate({
                        search: (prev) => ({
                          ...prev,
                          category: value ?? undefined,
                        }),
                      })
                    }
                  >
                    <SelectTrigger className="w-full bg-background">
                      <SelectValue
                        placeholder={t("qualities.list.all_categories")}
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
              </PopoverContent>
            </Popover>
            {data && (
              <p className="ml-auto text-xs text-muted-foreground">
                {t("qualities.list.count", { count: data.total })}
              </p>
            )}
          </div>

          {/* Active filters as removable chips, tucked under the toolbar. */}
          {hasFilters && (
            <div className="-mt-3 flex flex-wrap items-center gap-1.5">
              {activeFilters.map((filter) => (
                <Badge
                  key={filter.key}
                  variant="accent"
                  className="gap-0.5 pr-1"
                >
                  {filter.label}
                  <button
                    type="button"
                    onClick={dropCategory}
                    aria-label={t("qualities.list.remove_filter", {
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
                  {t("qualities.list.error")}
                </p>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  {t("common.actions.retry")}
                </Button>
              </div>
            </div>
          ) : isPending ? (
            <div className={gridClass}>
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={`sk-${index}`} className="h-40 rounded-xl" />
              ))}
            </div>
          ) : qualities.length === 0 ? (
            <div className="grid min-h-[30vh] place-items-center">
              <p className="text-sm text-muted-foreground">
                {t("qualities.list.empty")}
              </p>
            </div>
          ) : (
            // Flat grid — each card carries its category badge, so no section
            // headers. Server orders by category, position, name.
            <div className={gridClass}>
              {sortQualities(qualities, sortBy).map((quality) => (
                <QualityCard key={quality.id} quality={quality} />
              ))}
            </div>
          )}
        </>
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
