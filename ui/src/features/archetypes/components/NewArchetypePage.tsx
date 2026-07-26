import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useCreateArchetypeMutation } from "../api";
import { LIST_SEARCH } from "../keys";
import type { ArchetypeFormValues } from "../schemas";
import {
  ArchetypeForm,
  archetypeFormToPayload,
  EMPTY_ARCHETYPE_FORM,
} from "./ArchetypeForm";

export function NewArchetypePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mutate: createArchetype, isPending } = useCreateArchetypeMutation();

  const handleSubmit = (values: ArchetypeFormValues) => {
    createArchetype(
      { ...archetypeFormToPayload(values), position: 0 },
      {
        onSuccess: () => {
          toast.success(t("archetypes.new.toast_success"));
          navigate({ to: "/settings/archetypes", search: LIST_SEARCH });
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-xl font-semibold">
        {t("archetypes.new.title")}
      </h1>
      <ArchetypeForm
        defaultValues={EMPTY_ARCHETYPE_FORM}
        onSubmit={handleSubmit}
        isPending={isPending}
        submitLabel={t("common.actions.save")}
        onCancel={() =>
          navigate({ to: "/settings/archetypes", search: LIST_SEARCH })
        }
      />
    </div>
  );
}
