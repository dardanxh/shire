import { getRouteApi } from "@tanstack/react-router";
import { SearchIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export function SecurityListPage() {
  const { t } = useTranslation();
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
  });
  const practicesQuery = useDataSafetyPracticesQuery({
    q: search.tab === "practices" ? search.q : undefined,
    category: practiceCategory,
    complexity: search.tab === "practices" ? search.complexity : undefined,
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
        <Select
          items={categoryItems}
          value={
            (regulationCategory ?? practiceCategory ?? null) as string | null
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
          <SelectTrigger className="min-w-44 bg-background">
            <SelectValue placeholder={t("security.list.all_categories")} />
          </SelectTrigger>
          <SelectContent>
            {categoryItems.map((item) => (
              <SelectItem key={item.label} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {search.tab === "regulations" ? (
          <Select
            items={regionItems}
            value={search.region ?? null}
            onValueChange={(value) =>
              navigate({
                search: (prev) => ({ ...prev, region: value ?? undefined }),
              })
            }
          >
            <SelectTrigger className="min-w-36 bg-background">
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
        ) : (
          <Select
            items={complexityItems}
            value={search.complexity ?? null}
            onValueChange={(value) =>
              navigate({
                search: (prev) => ({ ...prev, complexity: value ?? undefined }),
              })
            }
          >
            <SelectTrigger className="min-w-40 bg-background">
              <SelectValue placeholder={t("security.list.all_complexities")} />
            </SelectTrigger>
            <SelectContent>
              {complexityItems.map((item) => (
                <SelectItem key={item.label} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <XIcon />
            {t("security.list.clear_filters")}
          </Button>
        )}
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(regulationsQuery.data?.items ?? []).map((regulation) => (
            <RegulationCard key={regulation.id} regulation={regulation} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(practicesQuery.data?.items ?? []).map((practice) => (
            <PracticeCard key={practice.id} practice={practice} />
          ))}
        </div>
      )}
    </div>
  );
}
