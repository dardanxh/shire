import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useCreateBlueprintMutation } from "../api";
import { LIST_SEARCH } from "../keys";
import type { BlueprintFormValues } from "../schemas";
import {
  BlueprintForm,
  blueprintFormToCreatePayload,
  EMPTY_BLUEPRINT_FORM,
} from "./BlueprintForm";

export function NewBlueprintPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mutate: createBlueprint, isPending } = useCreateBlueprintMutation();

  const handleSubmit = (values: BlueprintFormValues) => {
    createBlueprint(blueprintFormToCreatePayload(values), {
      onSuccess: (blueprint) => {
        toast.success(t("blueprints.new.toast_success"));
        navigate({ to: "/architectures/$id", params: { id: blueprint.id } });
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-xl font-semibold">
        {t("blueprints.new.title")}
      </h1>
      <BlueprintForm
        defaultValues={EMPTY_BLUEPRINT_FORM}
        includeSlug
        onSubmit={handleSubmit}
        isPending={isPending}
        submitLabel={t("common.actions.save")}
        onCancel={() => navigate({ to: "/architectures", search: LIST_SEARCH })}
      />
    </div>
  );
}
