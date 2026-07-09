import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { CheckboxList } from "@/components/shared/CheckboxList";
import { cn } from "@/lib/utils";

export type HobitOption = {
  slug: string;
  name: string;
  category: string;
  tags: string[];
};

/**
 * A hobit multi-select with tag-filter chips: click tags to narrow the list (OR), then check the
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
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());

  const allTags = useMemo(
    () => [...new Set(hobits.flatMap((h) => h.tags))].sort(),
    [hobits],
  );

  const filtered = useMemo(
    () =>
      activeTags.size === 0
        ? hobits
        : hobits.filter((h) => h.tags.some((tag) => activeTags.has(tag))),
    [hobits, activeTags],
  );

  const toggleTag = (tag: string) =>
    setActiveTags((s) => {
      const next = new Set(s);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });

  return (
    <div className="space-y-3">
      {allTags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((tag) => {
            const active = activeTags.has(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {tag}
              </button>
            );
          })}
          {activeTags.size > 0 ? (
            <button
              type="button"
              onClick={() => setActiveTags(new Set())}
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
