import { FolderCogIcon, PlusIcon, RocketIcon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  CardColumnsSelect,
  useCardColumns,
} from "@/components/shared/CardColumns";
import { StarredFilterButton } from "@/components/shared/StarredFilter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  type Bookmark,
  useBookmarksQuery,
  useLaunchpadCategoriesQuery,
  useRecordVisitMutation,
} from "../api";
import { rankBookmarks } from "../search";
import { BookmarkCard } from "./BookmarkCard";
import { BookmarkFormDialog } from "./BookmarkFormDialog";
import { CategoryManagerDialog } from "./CategoryManagerDialog";

export interface LaunchpadSearch {
  q?: string;
  category?: string;
  starred?: boolean;
}

/**
 * The Launchpad: every bookmark, fastest-first. The whole list is loaded once
 * and searched in memory, so results update on every keystroke; the query is
 * mirrored into the URL (debounced) only so a search survives reload/back.
 * Enter opens the top match — "type and go".
 */
export function LaunchpadPage({
  search,
  onSearchChange,
}: {
  search: LaunchpadSearch;
  onSearchChange: (next: Partial<LaunchpadSearch>, replace?: boolean) => void;
}) {
  const { t } = useTranslation();
  const [gridClass, columns, setColumns] = useCardColumns();
  const [query, setQuery] = useState(search.q ?? "");
  const [creating, setCreating] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const urlTimer = useRef<number | undefined>(undefined);

  const { data: bookmarks, isPending } = useBookmarksQuery({});
  const { data: categories } = useLaunchpadCategoriesQuery();
  const { mutate: recordVisit } = useRecordVisitMutation();

  const filtered = useMemo(() => {
    let rows = bookmarks ?? [];
    if (search.starred) rows = rows.filter((b) => b.starred);
    if (search.category) {
      rows = rows.filter((b) =>
        search.category === "none"
          ? b.category_id === null
          : b.category_id === search.category,
      );
    }
    return rankBookmarks(rows, query);
  }, [bookmarks, search.starred, search.category, query]);

  const searching = query.trim() !== "";
  const topMatch = searching ? filtered[0] : undefined;

  // Side effect: "/" focuses search from anywhere on the page (unless typing elsewhere).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    window.clearTimeout(urlTimer.current);
    urlTimer.current = window.setTimeout(
      () => onSearchChange({ q: value || undefined }, true),
      300,
    );
  };

  const openTopMatch = () => {
    if (!topMatch) return;
    window.open(topMatch.url, "_blank", "noopener,noreferrer");
    recordVisit(topMatch.id);
  };

  const sections = useMemo(
    () =>
      searching || search.starred || search.category
        ? [{ key: "results", title: null, items: filtered }]
        : groupSections(filtered, categories ?? [], t),
    [searching, search.starred, search.category, filtered, categories, t],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 font-heading text-2xl font-semibold">
            <RocketIcon className="size-6 text-primary" />
            {t("launchpad.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("launchpad.subtitle")}
          </p>
        </div>
        <Button variant="outline" onClick={() => setManagingCategories(true)}>
          <FolderCogIcon />
          {t("launchpad.categories.manage")}
        </Button>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon />
          {t("launchpad.add")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-md">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            autoFocus
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") openTopMatch();
              if (event.key === "Escape") handleQueryChange("");
            }}
            placeholder={t("launchpad.search.placeholder")}
            aria-label={t("launchpad.search.placeholder")}
            className="bg-background pl-8"
          />
        </div>
        <StarredFilterButton
          active={Boolean(search.starred)}
          label={t("launchpad.filters.starred")}
          onToggle={() =>
            onSearchChange({ starred: search.starred ? undefined : true })
          }
        />
        <CardColumnsSelect
          columns={columns}
          onChange={setColumns}
          label={t("common.cards.per_row")}
          autoLabel={t("common.cards.auto")}
        />
        {topMatch ? (
          <span className="text-xs text-muted-foreground">
            {t("launchpad.search.enter_hint", { name: topMatch.name })}
          </span>
        ) : null}
      </div>

      {categories && categories.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          <CategoryChip
            active={!search.category}
            label={t("launchpad.filters.all")}
            onClick={() => onSearchChange({ category: undefined })}
          />
          {categories.map((category) => (
            <CategoryChip
              key={category.id}
              active={search.category === category.id}
              label={`${category.name} · ${category.bookmark_count}`}
              onClick={() =>
                onSearchChange({
                  category:
                    search.category === category.id ? undefined : category.id,
                })
              }
            />
          ))}
          <CategoryChip
            active={search.category === "none"}
            label={t("launchpad.filters.uncategorized")}
            onClick={() =>
              onSearchChange({
                category: search.category === "none" ? undefined : "none",
              })
            }
          />
        </div>
      ) : null}

      {isPending ? (
        <div className={gridClass}>
          {["a", "b", "c", "d", "e", "f"].map((k) => (
            <Skeleton key={k} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : null}

      {bookmarks && bookmarks.length === 0 ? (
        <Card className="items-center gap-3 p-10 text-center">
          <RocketIcon className="size-8 text-muted-foreground" />
          <p className="font-medium">{t("launchpad.empty.title")}</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {t("launchpad.empty.body")}
          </p>
          <Button onClick={() => setCreating(true)}>
            <PlusIcon />
            {t("launchpad.add")}
          </Button>
        </Card>
      ) : null}

      {bookmarks && bookmarks.length > 0 && filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("launchpad.search.no_results")}
        </p>
      ) : null}

      {sections.map((section) =>
        section.items.length === 0 ? null : (
          <section key={section.key} className="space-y-3">
            {section.title ? (
              <h2 className="text-sm font-semibold text-muted-foreground">
                {section.title}
              </h2>
            ) : null}
            <div className={gridClass}>
              {section.items.map((bookmark) => (
                <BookmarkCard
                  key={bookmark.id}
                  bookmark={bookmark}
                  highlighted={bookmark.id === topMatch?.id}
                />
              ))}
            </div>
          </section>
        ),
      )}

      <BookmarkFormDialog
        open={creating}
        onOpenChange={setCreating}
        defaultCategoryId={
          search.category && search.category !== "none"
            ? search.category
            : undefined
        }
      />
      <CategoryManagerDialog
        open={managingCategories}
        onOpenChange={setManagingCategories}
      />
    </div>
  );
}

function CategoryChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

/** Starred first as their own row, then one section per category, uncategorized last. */
function groupSections(
  rows: Bookmark[],
  categories: { id: string; name: string }[],
  t: (key: string) => string,
) {
  const starred = rows.filter((b) => b.starred);
  const rest = rows.filter((b) => !b.starred);
  return [
    { key: "starred", title: t("launchpad.sections.starred"), items: starred },
    ...categories.map((category) => ({
      key: category.id,
      title: category.name,
      items: rest.filter((b) => b.category_id === category.id),
    })),
    {
      key: "uncategorized",
      title: t("launchpad.sections.uncategorized"),
      items: rest.filter((b) => b.category_id === null),
    },
  ];
}
