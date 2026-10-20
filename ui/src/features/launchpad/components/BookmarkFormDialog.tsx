import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  FormFooter,
  SelectField,
  TextareaField,
  TextField,
} from "@/components/shared/form-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  type Bookmark,
  useCreateBookmarkMutation,
  useCreateCategoryMutation,
  useLaunchpadCategoriesQuery,
  useUpdateBookmarkMutation,
} from "../api";
import { type BookmarkFormValues, makeBookmarkSchema } from "../schemas";

const NO_CATEGORY = "";

/**
 * Create or edit a bookmark. New categories can be added inline, so filing a
 * link never needs a detour. Logo: the site's own icon (fetched by the backend)
 * or a monogram; uploading a custom image lives on the bookmark page.
 */
export function BookmarkFormDialog({
  bookmark,
  open,
  onOpenChange,
  defaultCategoryId,
}: {
  bookmark?: Bookmark;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCategoryId?: string;
}) {
  const { t } = useTranslation();
  const isEdit = Boolean(bookmark);
  const { data: categories } = useLaunchpadCategoriesQuery();
  const { mutate: createBookmark, isPending: isCreating } =
    useCreateBookmarkMutation();
  const { mutate: updateBookmark, isPending: isUpdating } =
    useUpdateBookmarkMutation(bookmark?.id ?? "");
  const { mutate: createCategory, isPending: isCreatingCategory } =
    useCreateCategoryMutation();
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const isPending = isCreating || isUpdating;

  const form = useForm<BookmarkFormValues>({
    resolver: standardSchemaResolver(makeBookmarkSchema(t)),
    defaultValues: {
      name: "",
      url: "",
      description: "",
      categoryId: defaultCategoryId ?? NO_CATEGORY,
      logoKind: "favicon",
    },
    values: bookmark
      ? {
          name: bookmark.name,
          url: bookmark.url,
          description: bookmark.description ?? "",
          categoryId: bookmark.category_id ?? NO_CATEGORY,
          logoKind: bookmark.logo_kind === "monogram" ? "monogram" : "favicon",
        }
      : undefined,
  });

  const close = () => {
    setNewCategory(null);
    onOpenChange(false);
    if (!isEdit) form.reset();
  };

  const addCategory = () => {
    const name = newCategory?.trim();
    if (!name) return;
    createCategory(name, {
      onSuccess: (created) => {
        form.setValue("categoryId", created.id);
        setNewCategory(null);
      },
    });
  };

  const handleSubmit = (values: BookmarkFormValues) => {
    const categoryId = values.categoryId || null;
    if (bookmark) {
      updateBookmark(
        {
          name: values.name,
          url: values.url,
          description: values.description ?? "",
          category_id: categoryId,
          clear_category: categoryId === null,
          // An uploaded logo stays unless the user explicitly picks another kind.
          logo_kind:
            bookmark.logo_kind === "upload" && values.logoKind === "favicon"
              ? undefined
              : values.logoKind,
        },
        {
          onSuccess: (updated) => {
            toast.success(
              t("launchpad.form.toast_saved", { name: updated.name }),
            );
            close();
          },
        },
      );
      return;
    }
    createBookmark(
      {
        name: values.name,
        url: values.url,
        description: values.description || null,
        category_id: categoryId,
        logo_kind: values.logoKind,
      },
      {
        onSuccess: (created) => {
          toast.success(
            t("launchpad.form.toast_created", { name: created.name }),
          );
          close();
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        if (!next) close();
        else onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>
                {isEdit
                  ? t("launchpad.form.edit_title", { name: bookmark?.name })
                  : t("launchpad.form.new_title")}
              </DialogTitle>
              <DialogDescription>
                {t("launchpad.form.description")}
              </DialogDescription>
            </DialogHeader>

            <TextField<BookmarkFormValues>
              name="url"
              label={t("launchpad.form.url.label")}
              placeholder="https://jira.example.com/jira/software/projects/OPS/boards/1"
              autoFocus={!isEdit}
              required
              disabled={isPending}
            />
            <TextField<BookmarkFormValues>
              name="name"
              label={t("launchpad.form.name.label")}
              placeholder={t("launchpad.form.name.placeholder")}
              required
              disabled={isPending}
            />

            <div className="space-y-2">
              <SelectField<BookmarkFormValues>
                name="categoryId"
                label={t("launchpad.form.category.label")}
                disabled={isPending}
                options={[
                  {
                    value: NO_CATEGORY,
                    label: t("launchpad.filters.uncategorized"),
                  },
                  ...(categories ?? []).map((c) => ({
                    value: c.id,
                    label: c.name,
                  })),
                ]}
              />
              {newCategory === null ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0"
                  onClick={() => setNewCategory("")}
                >
                  <PlusIcon className="size-3.5" />
                  {t("launchpad.form.category.new")}
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    value={newCategory}
                    onChange={(event) => setNewCategory(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addCategory();
                      }
                    }}
                    placeholder={t("launchpad.form.category.new_placeholder")}
                    aria-label={t("launchpad.form.category.new")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!newCategory.trim() || isCreatingCategory}
                    onClick={addCategory}
                  >
                    {t("launchpad.form.category.add")}
                  </Button>
                </div>
              )}
            </div>

            <TextareaField<BookmarkFormValues>
              name="description"
              label={t("launchpad.form.notes.label")}
              placeholder={t("launchpad.form.notes.placeholder")}
              rows={2}
              disabled={isPending}
            />

            <SelectField<BookmarkFormValues>
              name="logoKind"
              label={t("launchpad.form.logo.label")}
              description={
                bookmark?.logo_kind === "upload"
                  ? t("launchpad.form.logo.uploaded_note")
                  : undefined
              }
              disabled={isPending}
              options={[
                { value: "favicon", label: t("launchpad.form.logo.favicon") },
                { value: "monogram", label: t("launchpad.form.logo.monogram") },
              ]}
            />

            <FormFooter
              submitLabel={
                isEdit ? t("common.actions.save") : t("launchpad.add")
              }
              cancelLabel={t("common.actions.cancel")}
              onCancel={close}
              isPending={isPending}
            />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
