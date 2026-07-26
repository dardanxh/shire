import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useTechnologyQuery, useUpdateTechnologyMutation } from "../api";
import type { TechnologyFormValues } from "../schemas";
import {
  EMPTY_TECHNOLOGY_FORM,
  TechnologyForm,
  technologyFormToPayload,
  technologyToFormValues,
} from "./TechnologyForm";

const route = getRouteApi("/technologies/$id/edit");

export function EditTechnologyPage() {
  const { t } = useTranslation();
  const { id } = route.useParams();
  const navigate = useNavigate();

  const { data: technology } = useTechnologyQuery(id);
  const { mutate: updateTechnology, isPending } =
    useUpdateTechnologyMutation(id);

  const handleSubmit = (values: TechnologyFormValues) => {
    updateTechnology(technologyFormToPayload(values), {
      onSuccess: () => {
        toast.success(t("technologies.edit.toast_success"));
        navigate({ to: "/technologies/$id", params: { id } });
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-xl font-semibold">
        {t("technologies.edit.title")}
      </h1>
      <TechnologyForm
        defaultValues={EMPTY_TECHNOLOGY_FORM}
        values={technology ? technologyToFormValues(technology) : undefined}
        onSubmit={handleSubmit}
        isPending={isPending}
        submitLabel={t("common.actions.save")}
        onCancel={() => navigate({ to: "/technologies/$id", params: { id } })}
      />
    </div>
  );
}
