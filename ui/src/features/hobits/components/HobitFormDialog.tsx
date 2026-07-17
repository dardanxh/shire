import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import type { ReactElement } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  FormFooter,
  SelectField,
  SwitchField,
  TextareaField,
  TextField,
} from "@/components/shared/form-fields";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { SelectItem } from "@/components/ui/select";
import type { HobitInput, HobitOut } from "@/lib/api";
import {
  useCreateHobitMutation,
  useUpdateHobitDefinitionMutation,
} from "../api";
import {
  HOBIT_MODELS,
  type HobitFormValues,
  makeHobitSchema,
} from "../schemas";

const CATEGORY_OPTIONS = [
  "Custom",
  "Theoretician",
  "Technology Expert",
] as const;

function toInput(values: HobitFormValues): HobitInput {
  return {
    name: values.name,
    description: values.description,
    category: values.category,
    model: values.model,
    charter: values.charter,
    instructions: values.instructions,
    timeout_seconds: Number(values.timeout_seconds),
    tags: values.tags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    enabled: values.enabled,
  };
}

/**
 * Create or fully edit a custom hobit in a dialog. Pass `hobit` to edit; omit it to create. Only
 * user-authored hobits reach this form — built-in hobits are configured, not redefined.
 */
export function HobitFormDialog({
  hobit,
  trigger,
}: {
  hobit?: HobitOut;
  trigger: ReactElement;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(hobit);
  const { mutate: create, isPending: creating } = useCreateHobitMutation();
  const { mutate: update, isPending: updating } =
    useUpdateHobitDefinitionMutation(hobit?.slug ?? "");
  const isPending = creating || updating;

  const form = useForm<HobitFormValues>({
    resolver: standardSchemaResolver(makeHobitSchema(t)),
    defaultValues: {
      name: hobit?.name ?? "",
      description: hobit?.description ?? "",
      category: hobit?.category ?? "Custom",
      model: hobit?.model ?? "sonnet",
      charter: hobit?.charter ?? "",
      instructions: hobit?.instructions ?? "",
      timeout_seconds: String(hobit?.timeout_seconds ?? 180),
      tags: hobit?.tags.join(", ") ?? "",
      enabled: hobit?.enabled ?? true,
    },
  });

  const onSubmit = (values: HobitFormValues) => {
    const body = toInput(values);
    const onSuccess = () => {
      toast.success(isEdit ? t("hobits.form.saved") : t("hobits.form.created"));
      setOpen(false);
    };
    if (isEdit) {
      update(body, { onSuccess });
    } else {
      create(body, {
        onSuccess: () => {
          onSuccess();
          form.reset();
        },
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (isPending) return;
        setOpen(o);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("hobits.form.edit_title", { name: hobit?.name })
              : t("hobits.form.new_title")}
          </DialogTitle>
          <DialogDescription>{t("hobits.form.dialog_desc")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <TextField<HobitFormValues>
              name="name"
              label={t("hobits.form.name.label")}
              placeholder={t("hobits.form.name.placeholder")}
              disabled={isPending}
            />
            <TextField<HobitFormValues>
              name="description"
              label={t("hobits.form.description.label")}
              placeholder={t("hobits.form.description.placeholder")}
              disabled={isPending}
            />
            <SelectField<HobitFormValues>
              name="category"
              label={t("hobits.form.category.label")}
              disabled={isPending}
            >
              {CATEGORY_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectField>
            <SelectField<HobitFormValues>
              name="model"
              label={t("hobits.form.model.label")}
              disabled={isPending}
            >
              {HOBIT_MODELS.map((m) => (
                <SelectItem key={m.alias} value={m.alias}>
                  {m.version}
                </SelectItem>
              ))}
            </SelectField>
            <TextareaField<HobitFormValues>
              name="charter"
              label={t("hobits.form.charter.label")}
              info={t("hobits.form.charter.desc")}
              rows={4}
              disabled={isPending}
              className="font-mono text-xs"
            />
            <TextareaField<HobitFormValues>
              name="instructions"
              label={t("hobits.form.instructions.label")}
              info={t("hobits.form.instructions.desc")}
              rows={8}
              disabled={isPending}
              className="font-mono text-xs"
            />
            <TextField<HobitFormValues>
              name="timeout_seconds"
              type="number"
              label={t("hobits.form.timeout.label")}
              disabled={isPending}
            />
            <TextField<HobitFormValues>
              name="tags"
              label={t("hobits.form.tags.label")}
              description={t("hobits.form.tags.desc")}
              placeholder="performance, latency"
              disabled={isPending}
            />
            <SwitchField<HobitFormValues>
              name="enabled"
              label={t("hobits.form.enabled.label")}
              info={t("hobits.form.enabled.desc")}
              disabled={isPending}
            />
            <FormFooter
              submitLabel={
                isEdit ? t("hobits.form.save") : t("hobits.form.create")
              }
              cancelLabel={t("common.actions.cancel")}
              onCancel={() => setOpen(false)}
              isPending={isPending}
            />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
