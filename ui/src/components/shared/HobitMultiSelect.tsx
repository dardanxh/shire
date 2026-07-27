import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { CheckboxList } from "@/components/shared/CheckboxList";
import { FilterMenu } from "@/components/shared/FilterMenu";

export type HobitOption = {
  slug: string;
  name: string;
  tags: string[];
};

/**
 * A hobit multi-select with a tag filter: narrow the list by tags (OR), then check the
 * hobits to select. Used by the onboarding wizard and the repo Hobits access editor.
 */
export function HobitMultiSelect({
  hobits,
  selected,
  onToggle,
  emptyLabel,
}: {
  hobits: HobitOption[];
  selected: Set<string>;
  onToggle: (slug: string) => void;
  emptyLabel?: string;
}) {
  const { t } = useTranslation();
  const [activeTags, setActiveTags] = useState<string[]>([]);

  const allTags = useMemo(
    () => [...new Set(hobits.flatMap((h) => h.tags))].sort(),
    [hobits],
  );

  const filtered = useMemo(
    () =>
      activeTags.length === 0
        ? hobits
        : hobits.filter((h) => h.tags.some((tag) => activeTags.includes(tag))),
    [hobits, activeTags],
  );

  return (
    <div className="space-y-3">
      {allTags.length > 0 ? (
        <div className="flex items-center gap-2">
          <FilterMenu
            label={t("hobits.filters.tags")}
            options={allTags}
            selected={activeTags}
            onChange={setActiveTags}
          />
          {activeTags.length > 0 ? (
            <button
              type="button"
              onClick={() => setActiveTags([])}
              className="px-2 py-0.5 text-xs text-muted-foreground underline"
            >
              {t("hobits.tags.clear_filter")}
            </button>
          ) : null}
        </div>
      ) : null}

      <CheckboxList
        items={filtered.map((h) => ({
          value: h.slug,
          label: h.name,
          hint: h.tags.join(" · "),
        }))}
        selected={selected}
        onToggle={onToggle}
        emptyLabel={emptyLabel}
      />
    </div>
  );
}
