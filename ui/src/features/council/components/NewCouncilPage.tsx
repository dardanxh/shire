import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  FormFooter,
  SwitchField,
  TextareaField,
  TextField,
} from "@/components/shared/form-fields";
import { RepoMultiSelect } from "@/components/shared/RepoMultiSelect";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useCreateCouncilTopicMutation } from "../api";
import {
  type CouncilTopicFormValues,
  makeCouncilTopicSchema,
} from "../schemas";

const LIST_SEARCH = { page: 1, size: 20 } as const;

/** Drop a topic: name + description (+ optional repos to ground the debate, + the devil's
 * advocate). Creating it kicks off the roster suggestion; convening happens on the view page. */
export function NewCouncilPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mutate: createTopic, isPending } = useCreateCouncilTopicMutation();

  const form = useForm<CouncilTopicFormValues>({
    resolver: standardSchemaResolver(makeCouncilTopicSchema(t)),
    defaultValues: {
      name: "",
      description: "",
      repository_ids: [],
      devils_advocate: false,
    },
  });

  const onSubmit = (values: CouncilTopicFormValues) => {
    createTopic(values, {
      onSuccess: (topic) => {
        toast.success(t("council.new.toast_success"));
        navigate({ to: "/council/$id", params: { id: topic.id } });
      },
    });
  };

  return (
    <Card className="mx-auto max-w-2xl">
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("council.new.subtitle")}
        </p>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <TextField<CouncilTopicFormValues>
              name="name"
              label={t("council.new.name_label")}
              placeholder={t("council.new.name_placeholder")}
              disabled={isPending}
            />
            <TextareaField<CouncilTopicFormValues>
              name="description"
              label={t("council.new.description_label")}
              description={t("council.new.description_help")}
              placeholder={t("council.new.description_placeholder")}
              rows={6}
              disabled={isPending}
            />
            <FormField
              control={form.control}
              name="repository_ids"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("council.new.repos_label")}</FormLabel>
                  <RepoMultiSelect
                    selected={new Set(field.value)}
                    onToggle={(repoId) =>
                      field.onChange(
                        field.value.includes(repoId)
                          ? field.value.filter((id) => id !== repoId)
                          : [...field.value, repoId],
                      )
                    }
                    searchPlaceholder={t("council.new.repo_search_placeholder")}
                    emptyLabel={t("council.new.no_repositories")}
                    loadingLabel={t("common.states.loading")}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <SwitchField<CouncilTopicFormValues>
              name="devils_advocate"
              label={t("council.new.da_label")}
              info={t("council.new.da_help")}
              disabled={isPending}
            />
            <FormFooter
              submitLabel={t("council.new.submit")}
              cancelLabel={t("common.actions.cancel")}
              isPending={isPending}
              onCancel={() => navigate({ to: "/council", search: LIST_SEARCH })}
            />
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
