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
import { useArchitectureQualitiesQuery } from "../api";
import { QUALITY_CATEGORIES, QUALITY_TABS, type QualityTab } from "../schemas";
import { QualityCard } from "./QualityCard";
import { QualityMatrix } from "./QualityMatrix";

const route = getRouteApi("/qualities/");

export function QualitiesListPage() {
  const { t } = useTranslation();
  const navigate = route.useNavigate();
  const search = route.useSearch();

  const { data, isPending, isError, refetch } = useArchitectureQualitiesQuery({
    q: search.tab === "catalog" ? search.q : undefined,
    category: search.tab === "catalog" ? search.category : undefined,
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
            <Select
              items={categoryItems}
              value={search.category ?? null}
              onValueChange={(value) =>
                navigate({
                  search: (prev) => ({ ...prev, category: value ?? undefined }),
                })
              }
            >
              <SelectTrigger className="min-w-44 bg-background">
                <SelectValue placeholder={t("qualities.list.all_categories")} />
              </SelectTrigger>
              <SelectContent>
                {categoryItems.map((item) => (
                  <SelectItem key={item.label} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <XIcon />
                {t("qualities.list.clear_filters")}
              </Button>
            )}
            {data && (
              <p className="ml-auto text-xs text-muted-foreground">
                {t("qualities.list.count", { count: data.total })}
              </p>
            )}
          </div>

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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {qualities.map((quality) => (
                <QualityCard key={quality.id} quality={quality} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
