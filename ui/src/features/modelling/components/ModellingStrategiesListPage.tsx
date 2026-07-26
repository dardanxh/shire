import { getRouteApi, Link } from "@tanstack/react-router";
import { PlusIcon, ScaleIcon, SearchIcon, XIcon } from "lucide-react";
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
import { useModellingStrategiesQuery } from "../api";
import { COMPLEXITIES, FAMILIES_BY_TOPIC, TOPICS } from "../schemas";
import { ModellingStrategyCard } from "./ModellingStrategyCard";

const route = getRouteApi("/data/");

export function ModellingStrategiesListPage() {
  const { t } = useTranslation();
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
        <Select
          items={familyItems}
          value={family ?? null}
          onValueChange={(value) =>
            navigate({
              search: (prev) => ({ ...prev, family: value ?? undefined }),
            })
          }
        >
          <SelectTrigger className="min-w-44 bg-background">
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
            <SelectValue placeholder={t("modelling.list.complexity_all")} />
          </SelectTrigger>
          <SelectContent>
            {complexityItems.map((item) => (
              <SelectItem key={item.label} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <XIcon />
            {t("modelling.list.clear_filters")}
          </Button>
        )}
        {data && (
          <p className="ml-auto text-xs text-muted-foreground">
            {t("modelling.list.count", {
              filtered: data.total,
              total: data.total,
            })}
          </p>
        )}
      </div>

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ordered.map((strategy) => (
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
