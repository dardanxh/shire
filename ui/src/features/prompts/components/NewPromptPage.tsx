import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  FormFooter,
  TextareaField,
  TextField,
} from "@/components/shared/form-fields";
import { Card } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { useCreatePromptMutation } from "../api";
import { type PromptFormValues, promptFormSchema } from "../schemas";

const EMPTY: PromptFormValues = {
  name: "",
  description: "",
  tags: "",
  body: "",
  guidance: "",
};

export function NewPromptPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mutate: createPrompt, isPending } = useCreatePromptMutation();

  const form = useForm<PromptFormValues>({
    resolver: standardSchemaResolver(promptFormSchema),
    defaultValues: EMPTY,
  });

  const handleSubmit = (values: PromptFormValues) => {
    createPrompt(
      {
        name: values.name,
        description: values.description || null,
        // The field is comma-separated for typing speed; the API takes a list.
        tags: values.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        body: values.body,
        guidance: values.guidance || null,
      },
      {
        onSuccess: (prompt) => {
          toast.success(t("prompts.new.created"));
          navigate({
            to: "/prompts/$id",
            params: { id: prompt.id },
            search: { tab: "checks" },
          });
        },
      },
    );
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{t("prompts.new.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("prompts.new.desc")}
        </p>
      </div>

      <Card className="p-6">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="flex flex-col gap-5"
          >
            <TextField<PromptFormValues>
              name="name"
              label={t("prompts.form.name")}
              placeholder={t("prompts.form.name_placeholder")}
              required
            />
            <TextareaField<PromptFormValues>
              name="description"
              label={t("prompts.form.description")}
              placeholder={t("prompts.form.description_placeholder")}
              rows={2}
            />
            <TextField<PromptFormValues>
              name="tags"
              label={t("prompts.form.tags")}
              description={t("prompts.form.tags_hint")}
              placeholder={t("prompts.form.tags_placeholder")}
            />
            <TextareaField<PromptFormValues>
              name="guidance"
              label={t("prompts.form.guidance")}
              description={t("prompts.form.guidance_hint")}
              rows={3}
            />
            <TextareaField<PromptFormValues>
              name="body"
              label={t("prompts.form.body")}
              placeholder={t("prompts.form.body_placeholder")}
              rows={14}
              required
              className="font-mono text-xs leading-relaxed"
            />
            <FormFooter
              submitLabel={t("prompts.new.submit")}
              cancelLabel={t("common.actions.cancel")}
              onCancel={() =>
                navigate({ to: "/prompts", search: { page: 1, size: 20 } })
              }
              isPending={isPending}
            />
          </form>
        </Form>
      </Card>
    </div>
  );
}
