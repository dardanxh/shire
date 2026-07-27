import { XIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import type { HobitOut } from "@/lib/api";
import { useUpdateHobitMutation } from "../api";

/**
 * Inline tag CRUD for a hobit: chips with remove, plus an add input. Each change saves
 * immediately through the config-update mutation (full effective config body).
 */
export function TagsEditor({ hobit }: { hobit: HobitOut }) {
  const { t } = useTranslation();
  const { mutate: save, isPending } = useUpdateHobitMutation(hobit.slug);
  const [draft, setDraft] = useState("");

  const commit = (tags: string[]) =>
    save({
      name: hobit.name,
      model: hobit.model,
      charter: hobit.charter,
      instructions: hobit.instructions,
      timeout_seconds: hobit.timeout_seconds,
      tags,
    });

  const addDraft = () => {
    const tag = draft.trim();
    setDraft("");
    if (!tag || hobit.tags.includes(tag)) return;
    commit([...hobit.tags, tag]);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {hobit.tags.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1 pr-1 text-xs">
          {tag}
          <button
            type="button"
            aria-label={t("hobits.view.tags_remove", { tag })}
            disabled={isPending}
            onClick={() => commit(hobit.tags.filter((x) => x !== tag))}
            className="rounded-full p-0.5 text-muted-foreground hover:text-destructive"
          >
            <XIcon className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addDraft();
          }
        }}
        disabled={isPending}
        aria-label={t("hobits.view.tags_add")}
        placeholder={t("hobits.view.tags_add")}
        className="h-6 w-24 rounded-md border border-dashed border-input bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground focus:border-solid focus:border-ring"
      />
    </div>
  );
}
