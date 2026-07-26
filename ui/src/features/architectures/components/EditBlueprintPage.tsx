import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useBlueprintQuery, useUpdateBlueprintMutation } from "../api";
import type { BlueprintFormValues } from "../schemas";
import {
  BlueprintForm,
  blueprintFormToUpdatePayload,
  blueprintToFormValues,
  EMPTY_BLUEPRINT_FORM,
} from "./BlueprintForm";

const route = getRouteApi("/architectures/$id/edit");

export function EditBlueprintPage() {
  const { t } = useTranslation();
  const { id } = route.useParams();
  const navigate = useNavigate();

  const { data: blueprint } = useBlueprintQuery(id);
  const { mutate: updateBlueprint, isPending } = useUpdateBlueprintMutation(id);

  const handleSubmit = (values: BlueprintFormValues) => {
    updateBlueprint(blueprintFormToUpdatePayload(values), {
      onSuccess: () => {
        toast.success(t("blueprints.edit.toast_success"));
        navigate({ to: "/architectures/$id", params: { id } });
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-xl font-semibold">
        {t("blueprints.edit.title")}
      </h1>
      {/* The backend flips a seed blueprint to `user` on PATCH. */}
      {blueprint?.source === "seed" && (
        <p className="flex max-w-4xl items-center gap-2 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <InfoIcon className="size-4 shrink-0" />
          {t("blueprints.view.seed_edit_hint")}
        </p>
      )}
      <BlueprintForm
        defaultValues={EMPTY_BLUEPRINT_FORM}
        values={blueprint ? blueprintToFormValues(blueprint) : undefined}
        includeSlug={false}
        onSubmit={handleSubmit}
        isPending={isPending}
        submitLabel={t("common.actions.save")}
        onCancel={() => navigate({ to: "/architectures/$id", params: { id } })}
      />
    </div>
  );
}
