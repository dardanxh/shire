import { getRouteApi, Link } from "@tanstack/react-router";
import {
  PlusIcon,
  ScaleIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  useInfiniteTechnologiesQuery,
  useStarredTechnologyTotalQuery,
  useTechnologyCategoriesQuery,
  useTechnologyTotalQuery,
} from "../api";
import { categoryNamesById, groupSlugsByCategoryId } from "../category-utils";
import { DEPLOYMENT_MODELS, MATURITIES } from "../schemas";
import { TechnologyCard } from "./TechnologyCard";
import { TechnologyLogo } from "./TechnologyLogo";

const route = getRouteApi("/technologies/");

// The Open-source filter maps a tri-state select onto the boolean `oss` param.
const OSS_ALL = "all";
const OSS_OPEN = "open";
const OSS_PROPRIETARY = "proprietary";

export function TechnologiesListPage() {
  const { t } = useTranslation();
  const navigate = route.useNavigate();
  const search = route.useSearch();

  const {
    data,
    isPending,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteTechnologiesQuery({
    q: search.q,
    category: search.category,
    maturity: search.maturity,
    deployment: search.deployment,
    oss: search.oss,
    starred: search.tab === "starred" ? true : undefined,
    time_to_win: search.time_to_win,
    cost_model: search.cost_model,
    cost_tier: search.cost_tier,
  });
  const { data: categoryTree } = useTechnologyCategoriesQuery();
  const { data: totalCount } = useTechnologyTotalQuery();
  const { data: starredCount } = useStarredTechnologyTotalQuery();
  const namesById = categoryNamesById(categoryTree);
  const groupSlugs = groupSlugsByCategoryId(categoryTree);

  const technologies = data?.pages.flatMap((page) => page.items) ?? [];
  // Total matching the current filters (each page carries the full match count).
  const filteredTotal = data?.pages[0]?.total;

  // Technologies ticked for comparison (max 3) — transient UI state.
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

  // Infinite scroll: fetch the next page when the sentinel scrolls into view.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const hasFilters = Boolean(
    search.q ||
      search.category ||
      search.maturity ||
      search.deployment ||
      search.time_to_win ||
      search.cost_model ||
      search.cost_tier ||
      search.oss !== undefined,
  );
  const clearFilters = () => {
    window.clearTimeout(searchTimer.current);
    setSearchInput("");
    navigate({ search: (prev) => ({ tab: prev.tab }) });
  };

  const maturityItems = [
    { value: null, label: t("technologies.list.maturity_all") },
    ...MATURITIES.map((maturity) => ({
      value: maturity,
      label: t(`technologies.maturity.${maturity}`),
    })),
  ];
  const deploymentItems = [
    { value: null, label: t("technologies.list.deployment_all") },
    ...DEPLOYMENT_MODELS.map((model) => ({
      value: model,
      label: t(`technologies.deployment.${model}`),
    })),
  ];
  const ttwItems = [
    { value: null, label: t("technologies.list.ttw_all") },
    ...["hours", "days", "weeks"].map((v) => ({
      value: v,
      label: t(`technologies.adoption.ttw_${v}`),
    })),
  ];
  const tierItems = [
    { value: null, label: t("technologies.list.tier_all") },
    ...["free", "low", "medium", "high"].map((v) => ({
      value: v,
      label: t(`technologies.adoption.tier_${v}`),
    })),
  ];
  const costItems = [
    { value: null, label: t("technologies.list.cost_all") },
    ...["free", "usage_based", "license", "enterprise"].map((v) => ({
      value: v,
      label: t(`technologies.adoption.cost_${v}`),
    })),
  ];
  const ossItems = [
    { value: OSS_ALL, label: t("technologies.list.oss_all") },
    { value: OSS_OPEN, label: t("technologies.oss.yes") },
    { value: OSS_PROPRIETARY, label: t("technologies.oss.no") },
  ];
  const ossValue =
    search.oss === undefined
      ? OSS_ALL
      : search.oss
        ? OSS_OPEN
        : OSS_PROPRIETARY;

  // Active select-filters as removable chips (q stays visible in the search box).
  const categoryLabel = (slug: string) => {
    for (const group of categoryTree ?? []) {
      if (group.slug === slug) return group.name;
      const child = (group.children ?? []).find((c) => c.slug === slug);
      if (child) return child.name;
    }
    return slug;
  };
  type FilterKey =
    | "category"
    | "maturity"
    | "deployment"
    | "oss"
    | "time_to_win"
    | "cost_model"
    | "cost_tier";
  const dropFilter = (key: FilterKey) =>
    navigate({ search: (prev) => ({ ...prev, [key]: undefined }) });
  const activeFilters: { key: FilterKey; label: string }[] = [];
  if (search.category)
    activeFilters.push({
      key: "category",
      label: categoryLabel(search.category),
    });
  if (search.maturity)
    activeFilters.push({
      key: "maturity",
      label: t(`technologies.maturity.${search.maturity}`),
    });
  if (search.deployment)
    activeFilters.push({
      key: "deployment",
      label: t(`technologies.deployment.${search.deployment}`),
    });
  if (search.oss !== undefined)
    activeFilters.push({
      key: "oss",
      label: search.oss ? t("technologies.oss.yes") : t("technologies.oss.no"),
    });
  if (search.time_to_win)
    activeFilters.push({
      key: "time_to_win",
      label: t(`technologies.adoption.ttw_${search.time_to_win}`),
    });
  if (search.cost_model)
    activeFilters.push({
      key: "cost_model",
      label: t(`technologies.adoption.cost_${search.cost_model}`),
    });
  if (search.cost_tier)
    activeFilters.push({
      key: "cost_tier",
      label: t(`technologies.adoption.tier_${search.cost_tier}`),
    });

  const TABS = [
    { key: "all", count: totalCount },
    { key: "starred", count: starredCount },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      {/* Tabs left, page action right — one header row (same as architectures). */}
      <div className="flex flex-wrap items-end justify-between gap-2 border-b">
        <div className="flex items-center gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() =>
                navigate({ search: (prev) => ({ ...prev, tab: tab.key }) })
              }
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                search.tab === tab.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`technologies.list.tab_${tab.key}`)}
              <span className="ml-1.5 text-xs text-muted-foreground">
                {tab.count}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Button
            size="sm"
            variant={compareIds.length >= 2 ? "default" : "outline"}
            render={
              <Link
                to="/technologies/compare"
                search={compareIds.length > 0 ? { ids: compareIds } : {}}
              />
            }
          >
            <ScaleIcon />
            {compareIds.length > 0
              ? t("technologies.list.compare_count", {
                  count: compareIds.length,
                })
              : t("technologies.list.compare_button")}
          </Button>
          <Button size="sm" render={<Link to="/technologies/new" />}>
            <PlusIcon />
            {t("technologies.list.new_button")}
          </Button>
        </div>
      </div>

      {/* One toolbar: search + filters left, count + page action right. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={handleSearchChange}
            placeholder={t("technologies.list.search_placeholder")}
            className="bg-background pl-8"
          />
        </div>
        <Popover>
          <PopoverTrigger
            render={<Button variant="outline" className="bg-background" />}
          >
            <SlidersHorizontalIcon />
            {t("technologies.list.filters")}
            {activeFilters.length > 0 && (
              <Badge variant="accent">{activeFilters.length}</Badge>
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="gap-3 p-3">
            <FilterField label={t("technologies.list.filter_category")}>
              <Select
                items={[
                  { value: null, label: t("technologies.list.category_all") },
                  ...(categoryTree ?? []).flatMap((group) => [
                    { value: group.slug, label: group.name },
                    ...(group.children ?? []).map((child) => ({
                      value: child.slug,
                      label: child.name,
                    })),
                  ]),
                ]}
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
                    placeholder={t("technologies.list.category_all")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>
                    {t("technologies.list.category_all")}
                  </SelectItem>
                  {(categoryTree ?? []).map((group) =>
                    group.children?.length ? (
                      <SelectGroup key={group.id}>
                        <SelectItem value={group.slug} className="font-medium">
                          {group.name}
                        </SelectItem>
                        {group.children.map((child) => (
                          <SelectItem
                            key={child.id}
                            value={child.slug}
                            className="pl-6"
                          >
                            {child.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ) : (
                      <SelectItem key={group.id} value={group.slug}>
                        {group.name}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label={t("technologies.list.filter_maturity")}>
              <Select
                items={maturityItems}
                value={search.maturity ?? null}
                onValueChange={(value) =>
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      maturity: value ?? undefined,
                    }),
                  })
                }
              >
                <SelectTrigger className="w-full bg-background">
                  <SelectValue
                    placeholder={t("technologies.list.maturity_all")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {maturityItems.map((item) => (
                    <SelectItem key={item.label} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label={t("technologies.list.filter_deployment")}>
              <Select
                items={deploymentItems}
                value={search.deployment ?? null}
                onValueChange={(value) =>
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      deployment: value ?? undefined,
                    }),
                  })
                }
              >
                <SelectTrigger className="w-full bg-background">
                  <SelectValue
                    placeholder={t("technologies.list.deployment_all")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {deploymentItems.map((item) => (
                    <SelectItem key={item.label} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label={t("technologies.list.filter_license")}>
              <Select
                items={ossItems}
                value={ossValue}
                onValueChange={(value) =>
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      oss:
                        value === OSS_OPEN
                          ? true
                          : value === OSS_PROPRIETARY
                            ? false
                            : undefined,
                    }),
                  })
                }
              >
                <SelectTrigger className="w-full bg-background">
                  <SelectValue placeholder={t("technologies.list.oss_all")} />
                </SelectTrigger>
                <SelectContent>
                  {ossItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label={t("technologies.list.filter_ttw")}>
              <Select
                items={ttwItems}
                value={search.time_to_win ?? null}
                onValueChange={(value) =>
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      time_to_win: value ?? undefined,
                    }),
                  })
                }
              >
                <SelectTrigger className="w-full bg-background">
                  <SelectValue placeholder={t("technologies.list.ttw_all")} />
                </SelectTrigger>
                <SelectContent>
                  {ttwItems.map((item) => (
                    <SelectItem key={item.label} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label={t("technologies.list.filter_cost_model")}>
              <Select
                items={costItems}
                value={search.cost_model ?? null}
                onValueChange={(value) =>
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      cost_model: value ?? undefined,
                    }),
                  })
                }
              >
                <SelectTrigger className="w-full bg-background">
                  <SelectValue placeholder={t("technologies.list.cost_all")} />
                </SelectTrigger>
                <SelectContent>
                  {costItems.map((item) => (
                    <SelectItem key={item.label} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label={t("technologies.list.filter_price")}>
              <Select
                items={tierItems}
                value={search.cost_tier ?? null}
                onValueChange={(value) =>
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      cost_tier: value ?? undefined,
                    }),
                  })
                }
              >
                <SelectTrigger className="w-full bg-background">
                  <SelectValue placeholder={t("technologies.list.tier_all")} />
                </SelectTrigger>
                <SelectContent>
                  {tierItems.map((item) => (
                    <SelectItem key={item.label} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          </PopoverContent>
        </Popover>
        {filteredTotal !== undefined && (
          <p className="ml-auto text-xs text-muted-foreground">
            {t("technologies.list.count", {
              filtered: filteredTotal,
              total: totalCount ?? filteredTotal,
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
                aria-label={t("technologies.list.remove_filter", {
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
        <CardGridSkeleton count={8} />
      ) : technologies.length === 0 &&
        search.tab === "starred" &&
        !hasFilters ? (
        <div className="grid min-h-[30vh] place-items-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="font-medium">
              {t("technologies.list.starred_empty_title")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("technologies.list.starred_empty_description")}
            </p>
          </div>
        </div>
      ) : technologies.length === 0 ? (
        <div className="grid min-h-[30vh] place-items-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="font-medium">{t("technologies.list.empty_title")}</p>
            <p className="text-sm text-muted-foreground">
              {t("technologies.list.empty_description")}
            </p>
            <Button
              variant="outline"
              size="sm"
              render={<Link to="/technologies/new" />}
            >
              {t("technologies.list.new_button")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {technologies.map((technology) => {
              const groupSlug = groupSlugs.get(technology.category_id);
              return (
                <TechnologyCard
                  key={technology.id}
                  technology={technology}
                  categoryName={namesById.get(technology.category_id)}
                  selected={compareIds.includes(technology.id)}
                  selectionActive={compareIds.length > 0}
                  selectionFull={compareIds.length >= 3}
                  onToggleSelect={() => toggleCompare(technology.id)}
                  logo={
                    <TechnologyLogo
                      name={technology.name}
                      homepageUrl={technology.homepage_url}
                      groupSlug={groupSlug}
                    />
                  }
                />
              );
            })}
          </div>

          {isFetchingNextPage && <CardGridSkeleton count={4} />}

          {/* Sentinel — scrolling it into view loads the next page. */}
          <div ref={sentinelRef} className="h-px" />

          {!hasNextPage && (
            <p className="text-center text-xs text-muted-foreground">
              {t("technologies.list.end_of_list")}
            </p>
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

function CardGridSkeleton({ count }: { count: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={`sk-${index}`} className="h-48 rounded-xl" />
      ))}
    </div>
  );
}
