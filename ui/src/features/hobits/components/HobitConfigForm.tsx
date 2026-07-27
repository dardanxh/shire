import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  FormFooter,
  TextareaField,
  TextField,
} from "@/components/shared/form-fields";
import { Form } from "@/components/ui/form";
import type { HobitOut } from "@/lib/api";
import { useUpdateHobitMutation } from "../api";
import { type HobitConfigFormValues, makeHobitConfigSchema } from "../schemas";
import { ModelPickerField } from "./ModelPickerField";

export function HobitConfigForm({ hobit }: { hobit: HobitOut }) {
  const { t } = useTranslation();
  const { mutate: save, isPending } = useUpdateHobitMutation(hobit.slug);

  const form = useForm<HobitConfigFormValues>({
    resolver: standardSchemaResolver(makeHobitConfigSchema(t)),
    defaultValues: {
      name: hobit.name,
      model: hobit.model,
      charter: hobit.charter,
      instructions: hobit.instructions,
      timeout_seconds: String(hobit.timeout_seconds),
    },
  });

  const onSubmit = (values: HobitConfigFormValues) => {
    save(
      {
        ...values,
        timeout_seconds: Number(values.timeout_seconds),
        // Tags are edited inline at the top of the page; carry the current set through.
        tags: hobit.tags,
      },
      { onSuccess: () => toast.success(t("hobits.view.saved_toast")) },
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <TextField<HobitConfigFormValues>
          name="name"
          label={t("hobits.form.name.label")}
          disabled={isPending}
        />
        <ModelPickerField<HobitConfigFormValues>
          name="model"
          label={t("hobits.form.model.label")}
          disabled={isPending}
        />
        <TextareaField<HobitConfigFormValues>
          name="charter"
          label={t("hobits.form.charter.label")}
          info={t("hobits.form.charter.desc")}
          rows={5}
          disabled={isPending}
          className="font-mono text-xs"
        />
        <TextareaField<HobitConfigFormValues>
          name="instructions"
          label={t("hobits.form.instructions.label")}
          info={t("hobits.form.instructions.desc")}
          rows={10}
          disabled={isPending}
          className="font-mono text-xs"
        />
        <TextField<HobitConfigFormValues>
          name="timeout_seconds"
          type="number"
          label={t("hobits.form.timeout.label")}
          disabled={isPending}
        />
        <FormFooter submitLabel={t("hobits.form.save")} isPending={isPending} />
      </form>
    </Form>
  );
}
