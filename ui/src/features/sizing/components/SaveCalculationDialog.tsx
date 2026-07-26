import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";

import { FormFooter, TextField } from "@/components/shared/form-fields";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { useCreateCapacityCalculationMutation } from "../api";
import type { SizingInputs } from "../calc";

const saveSchema = z.object({ name: z.string().min(1) });
type SaveFormValues = z.infer<typeof saveSchema>;

/** Names and persists the current calculator inputs to the backend. */
export function SaveCalculationDialog({
  open,
  onOpenChange,
  inputs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inputs: SizingInputs;
}) {
  const { t } = useTranslation();

  const form = useForm<SaveFormValues>({
    resolver: standardSchemaResolver(saveSchema),
    defaultValues: { name: "" },
  });

  const { mutate: createCalculation, isPending } =
    useCreateCapacityCalculationMutation();

  const handleSubmit = (values: SaveFormValues) => {
    createCalculation(
      { name: values.name, inputs },
      {
        onSuccess: () => {
          toast.success(t("sizing.save_dialog.success"));
          form.reset();
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("sizing.save_dialog.title")}</DialogTitle>
          <DialogDescription>
            {t("sizing.save_dialog.description")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="flex flex-col gap-4"
          >
            <TextField<SaveFormValues>
              name="name"
              label={t("sizing.save_dialog.name_label")}
              placeholder={t("sizing.save_dialog.name_placeholder")}
            />
            <FormFooter
              submitLabel={t("sizing.save_dialog.submit")}
              cancelLabel={t("common.actions.cancel")}
              onCancel={() => onOpenChange(false)}
              isPending={isPending}
            />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
