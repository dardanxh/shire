import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  CheckboxField,
  FormFooter,
  SelectField,
  TextareaField,
  TextField,
} from "@/components/shared/form-fields";
import { Form } from "@/components/ui/form";
import { SelectItem } from "@/components/ui/select";
import type { HobitOut } from "@/lib/api";
import { useUpdateHobitMutation } from "../api";
import { type HobitConfigFormValues, makeHobitConfigSchema } from "../schemas";

const MODEL_OPTIONS = ["sonnet", "opus", "haiku"];

export function HobitConfigForm({ hobit }: { hobit: HobitOut }) {
  const { t } = useTranslation();
  const { mutate: save, isPending } = useUpdateHobitMutation(hobit.slug);

  const form = useForm<HobitConfigFormValues>({
    resolver: standardSchemaResolver(makeHobitConfigSchema(t)),
    defaultValues: {
      enabled: hobit.enabled,
      model: hobit.model,
      charter: hobit.charter,
      instructions: hobit.instructions,
      timeout_seconds: String(hobit.timeout_seconds),
      tags: hobit.tags.join(", "),
    },
  });

  const onSubmit = (values: HobitConfigFormValues) => {
    save(
      {
        ...values,
        timeout_seconds: Number(values.timeout_seconds),
        tags: values.tags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      },
      { onSuccess: () => toast.success(t("hobits.view.saved_toast")) },
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <CheckboxField<HobitConfigFormValues>
          name="enabled"
          label={t("hobits.form.enabled.label")}
          disabled={isPending}
        />
        <SelectField<HobitConfigFormValues>
          name="model"
          label={t("hobits.form.model.label")}
          disabled={isPending}
        >
          {MODEL_OPTIONS.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectField>
        <TextareaField<HobitConfigFormValues>
          name="charter"
          label={t("hobits.form.charter.label")}
          description={t("hobits.form.charter.desc")}
          rows={5}
          disabled={isPending}
          className="font-mono text-xs"
        />
        <TextareaField<HobitConfigFormValues>
          name="instructions"
          label={t("hobits.form.instructions.label")}
          description={t("hobits.form.instructions.desc")}
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
        <TextField<HobitConfigFormValues>
          name="tags"
          label={t("hobits.form.tags.label")}
          description={t("hobits.form.tags.desc")}
          placeholder="data engineering, streaming"
          disabled={isPending}
        />
        <FormFooter submitLabel={t("hobits.form.save")} isPending={isPending} />
      </form>
    </Form>
  );
}
