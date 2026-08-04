import { useNavigate } from "@tanstack/react-router";
import {
  CalendarClockIcon,
  CheckSquareIcon,
  ChevronDownIcon,
  FolderGit2Icon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  CardColumnsSelect,
  useCardColumns,
} from "@/components/shared/CardColumns";
import { FilterMenu } from "@/components/shared/FilterMenu";
import { SortMenu } from "@/components/shared/SortMenu";
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
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { extractErrorMessage, type HobitOut } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  useBulkDeleteHobitsMutation,
  useBulkUpdateHobitsMutation,
  useHobitsQuery,
  useUpdateHobitMutation,
} from "../api";
import { HOBIT_MODELS } from "../schemas";
import { DeleteHobitDialog } from "./DeleteHobitDialog";
import { HobitFormDialog } from "./HobitFormDialog";

function sortHobits(items: HobitOut[], sortBy: string): HobitOut[] {
  if (sortBy === "name")
    return [...items].sort((a, b) => a.name.localeCompare(b.name));
  if (sortBy === "unread")
    return [...items].sort((a, b) => b.unread_count - a.unread_count);
  if (sortBy === "last_run")
    return [...items].sort((a, b) =>
      (b.last_run?.started_at ?? "").localeCompare(
        a.last_run?.started_at ?? "",
      ),
    );
  return items;
}

export function HobitsListPage({
  tags,
  query,
  onTagsChange,
  onQueryChange,
}: {
  tags: string[];
  query: string;
  onTagsChange: (next: string[]) => void;
  onQueryChange: (next: string) => void;
}) {
  const { t } = useTranslation();
  const { data: hobits, isPending, isError, error } = useHobitsQuery();
  const [gridClass, columns, setColumns] = useCardColumns();
  const [sortBy, setSortBy] = useState<string>("default");

  const all = hobits ?? [];
  const tagOptions = [...new Set(all.flatMap((h) => h.tags))].sort();
  const hasActiveFilters = tags.length > 0 || query !== "";

  const q = query.trim().toLowerCase();
  const matchesQuery = (h: HobitOut) =>
    q === "" ||
    [h.name, h.description, h.slug, ...h.tags].some((field) =>
      field.toLowerCase().includes(q),
    );

  const filtered = all.filter(
    (h) =>
      matchesQuery(h) &&
      (tags.length === 0 || h.tags.some((tag) => tags.includes(tag))),
  );

  // Ticked hobits for the bulk actions — transient UI state.
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const toggleSelect = (slug: string) =>
    setSelectedSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  const visibleSlugs = filtered.map((h) => h.slug);
  const allVisibleSelected =
    visibleSlugs.length > 0 &&
    visibleSlugs.every((slug) => selectedSlugs.includes(slug));
  const toggleSelectAll = () =>
    setSelectedSlugs(allVisibleSelected ? [] : visibleSlugs);

  const selectedHobits = all.filter((h) => selectedSlugs.includes(h.slug));
  // Everything is deletable except the foundational onboarding hobit (the ingest flow needs it).
  const deletableSelected = selectedHobits.filter(
    (h) => h.slug !== "repo-onboarding",
  );

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const { mutate: bulkUpdate, isPending: isBulkUpdating } =
    useBulkUpdateHobitsMutation();
  const { mutate: bulkDelete, isPending: isBulkDeleting } =
    useBulkDeleteHobitsMutation();

  const handleBulkModel = (model: string) => {
    const updates = selectedHobits.map((h) => ({
      slug: h.slug,
      body: { ...configOf(h), model },
    }));
    bulkUpdate(updates, {
      onSuccess: () => {
        toast.success(
          t("hobits.list.bulk_model_success", {
            count: updates.length,
            model:
              HOBIT_MODELS.find((m) => m.alias === model)?.version ?? model,
          }),
        );
        setSelectedSlugs([]);
      },
    });
  };

  const handleBulkDelete = () => {
    bulkDelete(
      deletableSelected.map((h) => h.slug),
      {
        onSuccess: () => {
          toast.success(
            t("hobits.list.bulk_delete_success", {
              count: deletableSelected.length,
            }),
          );
          setSelectedSlugs([]);
          setConfirmDeleteOpen(false);
        },
      },
    );
  };

  if (isError) {
    return (
      <Card className="p-12 text-center text-sm text-muted-foreground">
        {t("common.states.api_unreachable", {
          message: error ? extractErrorMessage(error) : "",
        })}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters left, bulk actions right (once cards are ticked). */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t("hobits.filters.search")}
            aria-label={t("hobits.filters.search")}
            className="h-8 w-52 pl-8"
          />
        </div>
        <FilterMenu
          label={t("hobits.filters.tags")}
          options={tagOptions}
          selected={tags}
          onChange={onTagsChange}
        />
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
            { value: "unread", label: t("common.sort.unread") },
            { value: "last_run", label: t("common.sort.last_run") },
          ]}
        />
        {hasActiveFilters ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onTagsChange([]);
              onQueryChange("");
            }}
          >
            {t("hobits.filters.clear")}
          </Button>
        ) : null}

        {selectedSlugs.length === 0 ? (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={visibleSlugs.length === 0}
            onClick={toggleSelectAll}
          >
            <CheckSquareIcon />
            {t("hobits.list.select_all")}
          </Button>
        ) : (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {t("hobits.list.selected_count", {
                count: selectedSlugs.length,
              })}
            </span>
            {allVisibleSelected ? null : (
              <Button size="sm" variant="ghost" onClick={toggleSelectAll}>
                {t("hobits.list.select_all")}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedSlugs([])}
            >
              {t("hobits.list.clear_selection")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="sm" variant="outline" disabled={isBulkUpdating}>
                    {t("hobits.list.bulk_model")}
                    <ChevronDownIcon />
                  </Button>
                }
              />
              <DropdownMenuContent>
                {HOBIT_MODELS.map((m) => (
                  <DropdownMenuItem
                    key={m.alias}
                    onClick={() => handleBulkModel(m.alias)}
                  >
                    {m.version}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Only custom hobits are deletable — hide the action when none are selected. */}
            {deletableSelected.length > 0 ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirmDeleteOpen(true)}
              >
                <Trash2Icon />
                {t("hobits.list.bulk_delete", {
                  count: deletableSelected.length,
                })}
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {isPending ? (
        <div className={gridClass}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          {all.length === 0 ? (
            t("hobits.list.empty")
          ) : (
            <div className="flex flex-col items-center gap-2">
              <p>{t("hobits.filters.no_matches")}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onTagsChange([]);
                  onQueryChange("");
                }}
              >
                {t("hobits.filters.clear")}
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div className={gridClass}>
          {sortHobits(filtered, sortBy).map((hobit) => (
            <HobitCard
              key={hobit.slug}
              hobit={hobit}
              selected={selectedSlugs.includes(hobit.slug)}
              selectionActive={selectedSlugs.length > 0}
              onToggleSelect={() => toggleSelect(hobit.slug)}
            />
          ))}
        </div>
      )}

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("hobits.list.bulk_delete_confirm_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("hobits.list.bulk_delete_confirm_body", {
                count: deletableSelected.length,
              })}
              {deletableSelected.length < selectedSlugs.length
                ? ` ${t("hobits.list.bulk_delete_skips_builtin")}`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>
              {t("common.actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isBulkDeleting}
              onClick={handleBulkDelete}
            >
              {t("hobits.list.bulk_delete", {
                count: deletableSelected.length,
              })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * One accent color per roster group (derived from the group tag) — data-visualization palette,
 * mirroring FAMILY_COLORS on architecture cards. Drives the card stripe + group chip.
 */
const GROUP_COLORS: Record<string, string> = {
  architecture: "#8b5cf6", // violet
  quality: "#10b981", // emerald
  technology: "#0ea5e9", // sky
  "mr review": "#f59e0b", // amber
  onboarding: "#64748b", // slate
  // Listed last so a technology expert that also carries it (Terraform) still groups as technology.
  infrastructure: "#14b8a6", // teal
};
const GROUPS = Object.keys(GROUP_COLORS);

/** Discipline tags — they say which craft a hobit belongs to, which the card already implies. */
const DISCIPLINE_TAGS = new Set([
  "data engineering",
  "software engineering",
  "platform engineering",
]);

const groupOf = (hobit: HobitOut) => GROUPS.find((g) => hobit.tags.includes(g));

/** One hobit card: tick to select, click anywhere else to open the detail page. */
function HobitCard({
  hobit,
  selected,
  selectionActive,
  onToggleSelect,
}: {
  hobit: HobitOut;
  selected: boolean;
  /** Any card selected — keeps every checkbox visible mid-selection. */
  selectionActive: boolean;
  onToggleSelect: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const group = groupOf(hobit);
  const accent = group ? GROUP_COLORS[group] : "#94a3b8";
  const open = () =>
    navigate({ to: "/hobits/$slug", params: { slug: hobit.slug } });

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (
          e.target === e.currentTarget &&
          (e.key === "Enter" || e.key === " ")
        ) {
          e.preventDefault();
          open();
        }
      }}
      className={cn(
        "group relative cursor-pointer gap-3 border-l-4 transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
        selected && "ring-2 ring-primary",
      )}
      style={{ borderLeftColor: accent }}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: stops card navigation around the checkbox */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard events on the checkbox don't bubble a click */}
      <span
        onClick={(e) => e.stopPropagation()}
        className="absolute top-4 right-4"
      >
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          aria-label={t("hobits.list.select_row", { name: hobit.name })}
          className={cn(
            "border-muted-foreground/40 bg-card",
            // Hidden at rest; revealed on hover/focus or while selecting.
            !selected &&
              !selectionActive &&
              "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
          )}
        />
      </span>
      <div className="pr-10 pl-(--card-spacing)">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{hobit.name}</span>
            {hobit.unread_count > 0 ? (
              <Badge>{hobit.unread_count}</Badge>
            ) : null}
          </div>
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {hobit.description}
          </p>
        </div>
      </div>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: stops card navigation around the inline controls */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the controls handle their own keyboard interaction */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-wrap items-center gap-2 px-(--card-spacing)"
      >
        <ModelCell hobit={hobit} />
        {hobit.assigned_repos > 0 ? (
          <span
            className="inline-flex items-center gap-1 text-xs text-muted-foreground"
            title={t("hobits.list.assigned_tooltip", {
              count: hobit.assigned_repos,
              scheduled: hobit.scheduled_repos,
            })}
          >
            <FolderGit2Icon className="size-3.5" />
            {hobit.assigned_repos}
            {hobit.scheduled_repos > 0 ? (
              <>
                <CalendarClockIcon className="ml-1 size-3.5" />
                {hobit.scheduled_repos}
              </>
            ) : null}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          {hobit.last_run ? (
            <span className="text-xs text-muted-foreground">
              {hobit.last_run.status}
              {hobit.last_run.tier ? ` · ${hobit.last_run.tier}` : ""}
            </span>
          ) : null}
          <CardActions hobit={hobit} />
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1 border-t px-(--card-spacing) pt-3">
        {group ? (
          <Badge
            variant="outline"
            className="border-transparent text-[10px] font-medium capitalize"
            style={{ backgroundColor: `${accent}1f`, color: accent }}
          >
            {group}
          </Badge>
        ) : null}
        {hobit.tags
          .filter((tag) => tag !== group && !DISCIPLINE_TAGS.has(tag))
          .map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px]">
              {tag}
            </Badge>
          ))}
      </div>
    </Card>
  );
}

/** Per-card actions: full edit for custom hobits; delete for everything but repo-onboarding. */
function CardActions({ hobit }: { hobit: HobitOut }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-end gap-1">
      {hobit.custom ? (
        <HobitFormDialog
          hobit={hobit}
          trigger={
            <Button
              size="icon-sm"
              variant="ghost"
              title={t("hobits.form.edit")}
            >
              <PencilIcon className="size-3.5" />
            </Button>
          }
        />
      ) : null}
      {hobit.slug !== "repo-onboarding" ? (
        <DeleteHobitDialog
          slug={hobit.slug}
          name={hobit.name}
          trigger={
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              title={t("hobits.delete.confirm")}
            >
              <Trash2Icon className="size-3.5" />
            </Button>
          }
        />
      ) : null}
    </div>
  );
}

/** Inline model picker — saves the full config with only `model` changed. */
function ModelCell({ hobit }: { hobit: HobitOut }) {
  const { mutate: save, isPending } = useUpdateHobitMutation(hobit.slug);
  return (
    <Select
      value={hobit.model}
      onValueChange={(model) => model && save({ ...configOf(hobit), model })}
      disabled={isPending}
    >
      <SelectTrigger className="h-7 w-28 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {HOBIT_MODELS.map((m) => (
          <SelectItem key={m.alias} value={m.alias}>
            {m.version}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The editable config fields carried on a row, as a HobitConfigUpdate body. */
function configOf(h: HobitOut) {
  return {
    name: h.name,
    model: h.model,
    charter: h.charter,
    instructions: h.instructions,
    timeout_seconds: h.timeout_seconds,
    tags: h.tags,
  };
}
