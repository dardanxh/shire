import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useCreateModellingStrategyMutation } from "../api";
import type { ModellingStrategyFormValues } from "../schemas";
import {
  EMPTY_MODELLING_STRATEGY_FORM,
  ModellingStrategyForm,
  modellingStrategyFormToPayload,
} from "./ModellingStrategyForm";

const route = getRouteApi("/data/new");

export function NewModellingStrategyPage() {
  const { t } = useTranslation();
  const { topic } = route.useSearch();
  const navigate = useNavigate();
  const { mutate: createStrategy, isPending } =
    useCreateModellingStrategyMutation();

  const handleSubmit = (values: ModellingStrategyFormValues) => {
    createStrategy(
      { ...modellingStrategyFormToPayload(values), position: 0 },
      {
        onSuccess: (strategy) => {
          toast.success(t("modelling.new.toast_success"));
          navigate({ to: "/data/$id", params: { id: strategy.id } });
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-xl font-semibold">
        {t("modelling.new.title")}
      </h1>
      <ModellingStrategyForm
        // The list's active tab pre-selects the topic.
        defaultValues={{ ...EMPTY_MODELLING_STRATEGY_FORM, topic }}
        onSubmit={handleSubmit}
        isPending={isPending}
        submitLabel={t("common.actions.save")}
        onCancel={() => navigate({ to: "/data", search: { tab: topic } })}
      />
    </div>
  );
}
