import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useCreateTechnologyMutation } from "../api";
import { LIST_SEARCH } from "../keys";
import type { TechnologyFormValues } from "../schemas";
import {
  EMPTY_TECHNOLOGY_FORM,
  TechnologyForm,
  technologyFormToPayload,
} from "./TechnologyForm";

export function NewTechnologyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mutate: createTechnology, isPending } = useCreateTechnologyMutation();

  const handleSubmit = (values: TechnologyFormValues) => {
    createTechnology(technologyFormToPayload(values), {
      onSuccess: () => {
        toast.success(t("technologies.new.toast_success"));
        navigate({ to: "/technologies", search: LIST_SEARCH });
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-xl font-semibold">
        {t("technologies.new.title")}
      </h1>
      <TechnologyForm
        defaultValues={EMPTY_TECHNOLOGY_FORM}
        onSubmit={handleSubmit}
        isPending={isPending}
        submitLabel={t("common.actions.save")}
        onCancel={() => navigate({ to: "/technologies", search: LIST_SEARCH })}
      />
    </div>
  );
}
