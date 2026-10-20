import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  type LaunchpadCategory,
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useLaunchpadCategoriesQuery,
  useUpdateCategoryMutation,
} from "../api";

/**
 * Add, rename, reorder and delete categories in one place. Deleting a
 * category never deletes its bookmarks — they become uncategorized.
 */
export function CategoryManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data: categories } = useLaunchpadCategoriesQuery();
  const { mutate: createCategory, isPending: isCreating } =
    useCreateCategoryMutation();
  const { mutate: updateCategory } = useUpdateCategoryMutation();
  const { mutate: deleteCategory } = useDeleteCategoryMutation();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(
    null,
  );
  const list = categories ?? [];

  const add = () => {
    if (!draft.trim()) return;
    createCategory(draft.trim(), { onSuccess: () => setDraft("") });
  };

  // Swap positions with the neighbour; positions are re-numbered densely so
  // legacy ties can't make a move a no-op.
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const reordered = [...list];
    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];
    reordered.forEach((category: LaunchpadCategory, position) => {
      if (category.position !== position) {
        updateCategory({ id: category.id, position });
      }
    });
  };

  const saveRename = () => {
    if (editing?.name.trim()) {
      updateCategory(
        { id: editing.id, name: editing.name.trim() },
        { onSuccess: () => setEditing(null) },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("launchpad.categories.title")}</DialogTitle>
          <DialogDescription>
            {t("launchpad.categories.description")}
          </DialogDescription>
        </DialogHeader>

        <ul className="divide-y divide-border rounded-md border">
          {list.length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">
              {t("launchpad.categories.empty")}
            </li>
          ) : null}
          {list.map((category, index) => (
            <li key={category.id} className="flex items-center gap-1 p-2">
              {editing?.id === category.id ? (
                <Input
                  autoFocus
                  value={editing.name}
                  onChange={(event) =>
                    setEditing({ id: category.id, name: event.target.value })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveRename();
                    if (event.key === "Escape") setEditing(null);
                  }}
                  className="h-8"
                  aria-label={t("launchpad.categories.rename")}
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm">
                  {category.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {category.bookmark_count}
                  </span>
                </span>
              )}
              {editing?.id === category.id ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={saveRename}
                  aria-label={t("common.actions.save")}
                >
                  <CheckIcon />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    setEditing({ id: category.id, name: category.name })
                  }
                  aria-label={t("launchpad.categories.rename")}
                >
                  <PencilIcon />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                aria-label={t("launchpad.categories.move_up")}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={index === list.length - 1}
                onClick={() => move(index, 1)}
                aria-label={t("launchpad.categories.move_down")}
              >
                <ArrowDownIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => deleteCategory(category.id)}
                aria-label={t("common.actions.delete")}
              >
                <Trash2Icon className="text-destructive" />
              </Button>
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") add();
            }}
            placeholder={t("launchpad.form.category.new_placeholder")}
            aria-label={t("launchpad.form.category.new")}
          />
          <Button disabled={!draft.trim() || isCreating} onClick={add}>
            <PlusIcon />
            {t("common.actions.add")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
