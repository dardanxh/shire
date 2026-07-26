import { getRouteApi, Link } from "@tanstack/react-router";
import {
  PlusIcon,
  ScaleIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  type Blueprint,
  useBlueprintCountsQuery,
  useBlueprintsQuery,
  useDeleteBlueprintMutation,
} from "../api";
import { FAMILIES, FAMILY_COLORS } from "../families";
import { USE_CASE_SLUGS } from "../use-cases";

const route = getRouteApi("/architectures/");

function BlueprintCard({
  blueprint,
  selected,
  selectionFull,
  onToggleSelect,
}: {
  blueprint: Blueprint;
  selected: boolean;
  /** Three architectures are already picked — block further selection. */
  selectionFull: boolean;
  onToggleSelect: () => void;
}) {
  const { t } = useTranslation();
  // Category stripe: the first family tag picks the accent color.
  const stripeColor =
    FAMILY_COLORS[blueprint.family_tags[0] as keyof typeof FAMILY_COLORS];
  return (
    <div className="relative h-full">
      <Link
        to="/architectures/$id"
        params={{ id: blueprint.id }}
        className="group block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Card
          className={cn(
            "flex h-full flex-col bg-card shadow-sm transition-shadow group-hover:shadow-lg",
            stripeColor && "border-l-4",
            selected && "border-primary ring-1 ring-primary",
          )}
          style={
            // 50 % alpha washes the stripe to match the app's muted-tint language.
            stripeColor ? { borderLeftColor: `${stripeColor}80` } : undefined
          }
        >
          <CardHeader className="pr-10">
            <CardTitle>{blueprint.name}</CardTitle>
            {blueprint.use_case && (
              <CardDescription>{blueprint.use_case}</CardDescription>
            )}
          </CardHeader>
        </Card>
      </Link>
      {/* Sibling of the Link (not a child) so toggling never triggers navigation. */}
      <Checkbox
        checked={selected}
        onCheckedChange={onToggleSelect}
        disabled={!selected && selectionFull}
        aria-label={t("blueprints.list.select_compare", {
          name: blueprint.name,
        })}
        className="absolute top-4 right-4 border-muted-foreground/40 bg-card"
      />
    </div>
  );
}

const TABS = ["blueprints", "mine"] as const;

export function BlueprintsListPage() {
  const { t } = useTranslation();
  const navigate = route.useNavigate();
  const search = route.useSearch();
  const source = search.tab === "mine" ? "user" : "seed";

  const {
    data: blueprints,
    isPending,
    isError,
    refetch,
  } = useBlueprintsQuery({
    family_tag: search.family_tag,
    use_case: search.use_case,
    q: search.q,
    source,
  });
  const { data: counts } = useBlueprintCountsQuery();
  const tabTotal = source === "user" ? counts?.user : counts?.seed;

  // Ticked architectures — compare (max 3) on the seed tab, delete on "mine".
  const isMine = search.tab === "mine";
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : !isMine && prev.length >= 3
          ? prev
          : [...prev, id],
    );

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const { mutateAsync: deleteBlueprint, isPending: isDeleting } =
    useDeleteBlueprintMutation();
  const handleBulkDelete = async () => {
    try {
      for (const id of selectedIds) await deleteBlueprint(id);
      toast.success(
        t("blueprints.list.delete_selected_success", {
          count: selectedIds.length,
        }),
      );
      setSelectedIds([]);
      setConfirmDeleteOpen(false);
    } catch {
      // Failures toast via the global mutation handler; already-deleted rows
      // drop out on invalidation, the rest stay selected for retry.
    }
  };

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

  const hasFilters = Boolean(search.q || search.family_tag || search.use_case);
  const clearFilters = () => {
    window.clearTimeout(searchTimer.current);
    setSearchInput("");
    navigate({ search: (prev) => ({ tab: prev.tab }) });
  };

  const useCaseItems = [
    { value: null, label: t("blueprints.list.use_case_all") },
    ...USE_CASE_SLUGS.map((slug) => ({
      value: slug as string,
      label: t(`blueprints.use_case_tags.${slug}`),
    })),
  ];

  const familyItems = [
    { value: null, label: t("blueprints.list.family_all") },
    ...FAMILIES.map((family) => ({
      value: family as string,
      label: t(`blueprints.family.${family}`),
    })),
  ];

  // Active select-filters as removable chips (q stays visible in the search box).
  type FilterKey = "family_tag" | "use_case";
  const dropFilter = (key: FilterKey) =>
    navigate({ search: (prev) => ({ ...prev, [key]: undefined }) });
  const activeFilters: { key: FilterKey; label: string }[] = [];
  if (search.family_tag)
    activeFilters.push({
      key: "family_tag",
      label: t(`blueprints.family.${search.family_tag}`),
    });
  if (search.use_case)
    activeFilters.push({
      key: "use_case",
      label: t(`blueprints.use_case_tags.${search.use_case}`),
    });

  return (
    <div className="flex flex-col gap-6">
      {/* Tabs left, page actions right — one header row. */}
      <div className="flex flex-wrap items-end justify-between gap-2 border-b">
        <div className="flex items-center gap-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setSelectedIds([]);
                navigate({ search: (prev) => ({ ...prev, tab }) });
              }}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                search.tab === tab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`blueprints.list.tab_${tab}`)}
              <span className="ml-1.5 text-xs text-muted-foreground">
                {tab === "blueprints" ? counts?.seed : counts?.user}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 pb-2">
          {isMine ? (
            selectedIds.length > 0 && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirmDeleteOpen(true)}
              >
                <Trash2Icon />
                {t("blueprints.list.delete_selected_button", {
                  count: selectedIds.length,
                })}
              </Button>
            )
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                render={<Link to="/architectures/advisor" />}
              >
                <SparklesIcon />
                {t("blueprints.list.advisor_button")}
              </Button>
              <Button
                size="sm"
                variant={selectedIds.length >= 2 ? "default" : "outline"}
                render={
                  <Link
                    to="/architectures/compare"
                    search={selectedIds.length > 0 ? { ids: selectedIds } : {}}
                  />
                }
              >
                <ScaleIcon />
                {selectedIds.length > 0
                  ? t("blueprints.list.compare_count", {
                      count: selectedIds.length,
                    })
                  : t("blueprints.list.compare_button")}
              </Button>
              <Button size="sm" render={<Link to="/architectures/new" />}>
                <PlusIcon />
                {t("blueprints.list.new_button")}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* One toolbar: search + filters together, result count at the right. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={handleSearchChange}
            placeholder={t("blueprints.list.search_placeholder")}
            className="bg-background pl-8"
          />
        </div>
        <Popover>
          <PopoverTrigger
            render={<Button variant="outline" className="bg-background" />}
          >
            <SlidersHorizontalIcon />
            {t("blueprints.list.filters")}
            {activeFilters.length > 0 && (
              <Badge variant="accent">{activeFilters.length}</Badge>
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="gap-3 p-3">
            <FilterField label={t("blueprints.list.filter_family")}>
              <Select
                items={familyItems}
                value={search.family_tag ?? null}
                onValueChange={(value) =>
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      family_tag: value ?? undefined,
                    }),
                  })
                }
              >
                <SelectTrigger className="w-full bg-background">
                  <SelectValue placeholder={t("blueprints.list.family_all")} />
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
            <FilterField label={t("blueprints.list.filter_use_case")}>
              <Select
                items={useCaseItems}
                value={search.use_case ?? null}
                onValueChange={(value) =>
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      use_case: value ?? undefined,
                    }),
                  })
                }
              >
                <SelectTrigger className="w-full bg-background">
                  <SelectValue
                    placeholder={t("blueprints.list.use_case_all")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {useCaseItems.map((item) => (
                    <SelectItem key={item.label} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          </PopoverContent>
        </Popover>
        {blueprints !== undefined && (
          <p className="ml-auto text-xs text-muted-foreground">
            {t("blueprints.list.count", {
              filtered: blueprints.length,
              total: tabTotal ?? blueprints.length,
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
                aria-label={t("blueprints.list.remove_filter", {
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

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="grid min-h-[40vh] place-items-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              {t("common.table.error")}
            </p>
            <Button variant="outline" onClick={() => refetch()}>
              {t("common.actions.retry")}
            </Button>
          </div>
        </div>
      ) : blueprints && blueprints.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {blueprints.map((blueprint) => (
            <BlueprintCard
              key={blueprint.id}
              blueprint={blueprint}
              selected={selectedIds.includes(blueprint.id)}
              selectionFull={!isMine && selectedIds.length >= 3}
              onToggleSelect={() => toggleSelect(blueprint.id)}
            />
          ))}
        </div>
      ) : search.tab === "mine" && !hasFilters ? (
        <div className="grid min-h-[40vh] place-items-center">
          <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
            <p className="font-medium">{t("blueprints.list.my_empty_title")}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t("blueprints.list.my_empty_description")}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigate({ search: (prev) => ({ ...prev, tab: "blueprints" }) })
              }
            >
              {t("blueprints.list.browse_blueprints")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid min-h-[40vh] place-items-center">
          <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
            <p className="font-medium">{t("blueprints.list.empty_title")}</p>
            <p className="text-sm text-muted-foreground">
              {t("blueprints.list.empty_description")}
            </p>
            <Button
              variant="outline"
              size="sm"
              render={<Link to="/architectures/new" />}
            >
              {t("blueprints.list.new_button")}
            </Button>
          </div>
        </div>
      )}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("blueprints.list.delete_selected_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("blueprints.list.delete_selected_description", {
                count: selectedIds.length,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t("common.actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={handleBulkDelete}
            >
              {t("blueprints.list.delete_selected_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
