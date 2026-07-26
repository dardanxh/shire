import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { ArchiveIcon, ArchiveRestoreIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useArchetypeQuery,
  useSetArchetypeArchivedMutation,
  useUpdateArchetypeMutation,
} from "../api";
import { LIST_SEARCH } from "../keys";
import type { ArchetypeFormValues } from "../schemas";
import {
  ArchetypeForm,
  archetypeFormToPayload,
  archetypeToFormValues,
  EMPTY_ARCHETYPE_FORM,
} from "./ArchetypeForm";
import { DeleteArchetypeDialog } from "./DeleteArchetypeDialog";

const route = getRouteApi("/settings/archetypes/$id/edit");

export function EditArchetypePage() {
  const { t } = useTranslation();
  const { id } = route.useParams();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: archetype } = useArchetypeQuery(id);
  const { mutate: updateArchetype, isPending } = useUpdateArchetypeMutation(id);
  const { mutate: setArchived, isPending: isArchiving } =
    useSetArchetypeArchivedMutation();

  const goToList = () =>
    navigate({ to: "/settings/archetypes", search: LIST_SEARCH });

  const handleSubmit = (values: ArchetypeFormValues) => {
    updateArchetype(archetypeFormToPayload(values), {
      onSuccess: () => {
        toast.success(t("archetypes.edit.toast_success"));
        goToList();
      },
    });
  };

  const handleToggleArchived = () => {
    if (!archetype) return;
    setArchived(
      { id: archetype.id, archived: !archetype.archived },
      {
        onSuccess: (updated) => {
          toast.success(
            updated.archived
              ? t("archetypes.archive.toast_archived")
              : t("archetypes.archive.toast_unarchived"),
          );
        },
      },
    );
  };

  const hasSeedManaged =
    archetype &&
    (archetype.typical_category_slugs.length > 0 ||
      archetype.default_blueprint_slugs.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-2xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-xl font-semibold">
            {t("archetypes.edit.title")}
          </h1>
          {archetype?.archived && (
            <Badge variant="destructive">
              {t("archetypes.badges.archived")}
            </Badge>
          )}
        </div>
        {archetype && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={isArchiving}
              onClick={handleToggleArchived}
            >
              {archetype.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
              {archetype.archived
                ? t("archetypes.archive.unarchive")
                : t("archetypes.archive.archive")}
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2Icon />
              {t("common.actions.delete")}
            </Button>
          </div>
        )}
      </div>

      <ArchetypeForm
        defaultValues={EMPTY_ARCHETYPE_FORM}
        values={archetype ? archetypeToFormValues(archetype) : undefined}
        onSubmit={handleSubmit}
        isPending={isPending}
        submitLabel={t("common.actions.save")}
        onCancel={goToList}
      />

      {hasSeedManaged && (
        <dl className="flex max-w-2xl flex-col gap-4 rounded-xl border p-4">
          <p className="text-sm font-medium">
            {t("archetypes.edit.seed_managed_title")}
          </p>
          <div className="grid gap-1 sm:grid-cols-[12rem_1fr] sm:gap-4">
            <dt className="text-sm font-medium text-muted-foreground">
              {t("archetypes.edit.typical_categories")}
            </dt>
            <dd className="flex min-w-0 flex-wrap gap-1">
              {archetype.typical_category_slugs.length > 0
                ? archetype.typical_category_slugs.map((slug) => (
                    <Badge key={slug} variant="outline">
                      {slug}
                    </Badge>
                  ))
                : t("archetypes.edit.none")}
            </dd>
          </div>
          <div className="grid gap-1 sm:grid-cols-[12rem_1fr] sm:gap-4">
            <dt className="text-sm font-medium text-muted-foreground">
              {t("archetypes.edit.default_blueprints")}
            </dt>
            <dd className="flex min-w-0 flex-wrap gap-1">
              {archetype.default_blueprint_slugs.length > 0
                ? archetype.default_blueprint_slugs.map((slug) => (
                    <Badge key={slug} variant="outline">
                      {slug}
                    </Badge>
                  ))
                : t("archetypes.edit.none")}
            </dd>
          </div>
        </dl>
      )}

      {archetype && (
        <DeleteArchetypeDialog
          archetype={archetype}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onDeleted={goToList}
        />
      )}
    </div>
  );
}
