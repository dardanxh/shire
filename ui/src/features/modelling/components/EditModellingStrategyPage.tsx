import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import {
  useModellingStrategyQuery,
  useUpdateModellingStrategyMutation,
} from "../api";
import type { ModellingStrategyFormValues } from "../schemas";
import {
  EMPTY_MODELLING_STRATEGY_FORM,
  ModellingStrategyForm,
  modellingStrategyFormToPayload,
  modellingStrategyToFormValues,
} from "./ModellingStrategyForm";

const route = getRouteApi("/data/$id/edit");

export function EditModellingStrategyPage() {
  const { t } = useTranslation();
  const { id } = route.useParams();
  const navigate = useNavigate();

  const { data: strategy, isPending } = useModellingStrategyQuery(id);
  const { mutate: updateStrategy, isPending: isSaving } =
    useUpdateModellingStrategyMutation(id);

  const handleSubmit = (values: ModellingStrategyFormValues) => {
    updateStrategy(modellingStrategyFormToPayload(values), {
      onSuccess: () => {
        toast.success(t("modelling.edit.toast_success"));
        navigate({ to: "/data/$id", params: { id } });
      },
    });
  };

  if (isPending || !strategy) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-xl font-semibold">
        {t("modelling.edit.title")}
      </h1>
      <ModellingStrategyForm
        defaultValues={EMPTY_MODELLING_STRATEGY_FORM}
        values={modellingStrategyToFormValues(strategy)}
        onSubmit={handleSubmit}
        isPending={isSaving}
        submitLabel={t("common.actions.save")}
        onCancel={() => navigate({ to: "/data/$id", params: { id } })}
      />
    </div>
  );
}
